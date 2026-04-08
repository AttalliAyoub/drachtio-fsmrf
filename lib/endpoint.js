"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const assert_1 = __importDefault(require("assert"));
const events_1 = require("events");
const conference_1 = __importDefault(require("./conference"));
const utils_1 = require("./utils");
const snake_case_1 = require("snake-case");
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('drachtio:fsmrf');
var State;
(function (State) {
    State[State["NOT_CONNECTED"] = 1] = "NOT_CONNECTED";
    State[State["EARLY"] = 2] = "EARLY";
    State[State["CONNECTED"] = 3] = "CONNECTED";
    State[State["DISCONNECTED"] = 4] = "DISCONNECTED";
})(State || (State = {}));
const EVENTS_OF_INTEREST = [
    'CHANNEL_EXECUTE',
    'CHANNEL_EXECUTE_COMPLETE',
    'CHANNEL_PROGRESS_MEDIA',
    'CHANNEL_CALLSTATE',
    'CHANNEL_ANSWER',
    'DTMF',
    'DETECTED_TONE',
    'SWITCH_EVENT_PLAYBACK_START',
    'SWITCH_EVENT_PLAYBACK_STOP',
    'CUSTOM conference::maintenance'
];
class Endpoint extends events_1.EventEmitter {
    _customEvents;
    _conn;
    _ms;
    _dialog;
    uuid;
    secure;
    local;
    remote;
    sip;
    conf;
    state;
    _muted;
    _ready = false;
    _joinCallback;
    dtmfType;
    constructor(conn, dialog, ms, opts) {
        super();
        opts = opts || {};
        this._customEvents = (opts.customEvents = opts.customEvents || []).map((ev) => `CUSTOM ${ev}`);
        (0, assert_1.default)(Array.isArray(this._customEvents));
        this._conn = conn;
        this._ms = ms;
        this._dialog = dialog;
        const info = conn.getInfo();
        this.uuid = info.getHeader('Channel-Unique-ID');
        this.secure = /^m=audio\s\d*\sUDP\/TLS\/RTP\/SAVPF/m.test(info.getHeader('variable_switch_r_sdp'));
        this.local = {};
        this.remote = {};
        this.sip = {};
        this.conf = {};
        this.state = State.NOT_CONNECTED;
        this._muted = false;
        debug(`Endpoint#ctor creating endpoint with uuid ${this.uuid}, is3pcc: ${opts.is3pcc}`);
        this.conn.subscribe(EVENTS_OF_INTEREST.concat(this._customEvents).join(' '));
        this.filter('Unique-ID', this.uuid);
        this.conn.on(`esl::event::CHANNEL_HANGUP::${this.uuid}`, this._onHangup.bind(this));
        this.conn.on(`esl::event::CHANNEL_CALLSTATE::${this.uuid}`, this._onChannelCallState.bind(this));
        this.conn.on(`esl::event::DTMF::${this.uuid}`, this._onDtmf.bind(this));
        this.conn.on(`esl::event::DETECTED_TONE::${this.uuid}`, this._onToneDetect.bind(this));
        this.conn.on(`esl::event::PLAYBACK_START::${this.uuid}`, this._onPlaybackStart.bind(this));
        this.conn.on(`esl::event::PLAYBACK_STOP::${this.uuid}`, this._onPlaybackStop.bind(this));
        this.conn.on(`esl::event::CUSTOM::${this.uuid}`, this._onCustomEvent.bind(this));
        this.conn.on('error', this._onError.bind(this));
        this.conn.on('esl::end', () => {
            debug(`got esl::end for ${this.uuid}`);
            if (this.state !== State.DISCONNECTED) {
                debug(`got unexpected esl::end in state ${this.state} for ${this.uuid}`);
                this.state = State.DISCONNECTED;
                this.emit('destroy');
            }
            this.removeAllListeners();
            this._conn = null;
        });
        if (!opts.is3pcc) {
            if (opts.codecs) {
                if (typeof opts.codecs === 'string')
                    opts.codecs = [opts.codecs];
                if (opts.codecs.length > 0) {
                    this.execute('set', `codec_string=${opts.codecs.join(',')}`);
                }
            }
        }
        this.local.sdp = info.getHeader('variable_rtp_local_sdp_str');
        this.local.mediaIp = info.getHeader('variable_local_media_ip');
        this.local.mediaPort = info.getHeader('variable_local_media_port');
        this.remote.sdp = info.getHeader('variable_switch_r_sdp');
        this.remote.mediaIp = info.getHeader('variable_remote_media_ip');
        this.remote.mediaPort = info.getHeader('variable_remote_media_port');
        this.dtmfType = info.getHeader('variable_dtmf_type');
        this.sip.callId = info.getHeader('variable_sip_call_id');
        this.state = State.CONNECTED;
        this._emitReady();
    }
    get mediaserver() {
        return this._ms;
    }
    get ms() {
        return this._ms;
    }
    get srf() {
        return this.ms.srf;
    }
    get conn() {
        return this._conn;
    }
    get dialog() {
        return this._dialog;
    }
    set dialog(dlg) {
        this._dialog = dlg;
    }
    get connected() {
        return this.state === State.CONNECTED;
    }
    get muted() {
        return this._muted;
    }
    filter(header, value) {
        if (this._conn)
            this._conn.filter(header, value);
    }
    request(opts) {
        if (this._dialog)
            return this._dialog.request(opts);
    }
    async _setOrExport(which, param, value, callback) {
        const obj = {};
        if (typeof param === 'string')
            obj[param] = value;
        else
            Object.assign(obj, param);
        const __x = async (cb) => {
            const p = [];
            if (which === 'set' && Object.keys(obj).length > 1) {
                const hasSpecialChar = (str) => {
                    if (typeof str !== 'string')
                        return false;
                    return str.includes('^') || str.includes('\n') || str.includes('"') || str.includes("'");
                };
                const singleEntries = Object.entries(obj).filter(([_, val]) => hasSpecialChar(val));
                const multiEntries = Object.entries(obj).filter(([_, val]) => !hasSpecialChar(val));
                if (multiEntries.length) {
                    const args = multiEntries.map(([k, val]) => `${k}=${val}`).join('^');
                    p.push(this.execute('multiset', `^^^${args}`));
                }
                singleEntries.forEach(([k, val]) => {
                    p.push(this.execute(which, `${k}=${val}`));
                });
            }
            else {
                for (const [k, val] of Object.entries(obj)) {
                    p.push(this.execute(which, `${k}=${val}`));
                }
            }
            await Promise.all(p);
            cb(null);
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, res) => {
                if (err)
                    return reject(err);
                resolve(res);
            });
        });
    }
    set(param, value, callback) {
        if (typeof param === 'object' && typeof value === 'function') {
            callback = value;
            value = undefined;
        }
        return this._setOrExport('set', param, value, callback);
    }
    export(param, value, callback) {
        if (typeof param === 'object' && typeof value === 'function') {
            callback = value;
            value = undefined;
        }
        return this._setOrExport('export', param, value, callback);
    }
    resetEslCustomEvent() {
        this.conn.removeAllListeners('esl::event::CUSTOM::*');
        this.conn.on(`esl::event::CUSTOM::${this.uuid}`, this._onCustomEvent.bind(this));
    }
    addCustomEventListener(event, handler) {
        assert_1.default.ok(typeof event === 'string', 'event name must be string type');
        assert_1.default.ok(typeof handler === 'function', 'handler must be a function type');
        assert_1.default.ok(event.indexOf('CUSTOM ') !== 0, "event name should not include 'CUSTOM ' prefix");
        const fullEventName = `CUSTOM ${event}`;
        if (-1 === this._customEvents.indexOf(fullEventName)) {
            this._customEvents.push(fullEventName);
            this.conn.subscribe(fullEventName);
        }
        this.removeListener(event, handler);
        this.on(event, handler);
    }
    removeCustomEventListener(event, handler) {
        let del = false;
        if (handler) {
            this.removeListener(event, handler);
            del = this.listenerCount(event) === 0;
        }
        else {
            this.removeAllListeners(event);
            del = true;
        }
        const fullEventName = `CUSTOM ${event}`;
        const idx = this._customEvents.indexOf(fullEventName);
        if (-1 !== idx && del)
            this._customEvents.splice(idx, 1);
    }
    getChannelVariables(includeMedia, callback) {
        if (typeof includeMedia === 'function') {
            callback = includeMedia;
            includeMedia = false;
        }
        const __x = async (cb) => {
            try {
                if (includeMedia === true)
                    await this.api('uuid_set_media_stats', this.uuid);
                const { headers, body } = await this.api('uuid_dump', this.uuid);
                const hdrs = {};
                headers.forEach((h) => (hdrs[h.name] = h.value));
                if (hdrs['Content-Type'] === 'api/response' && 'Content-Length' in hdrs) {
                    const bodyLen = parseInt(hdrs['Content-Length'], 10);
                    return cb(null, (0, utils_1.parseBodyText)(body.slice(0, bodyLen)));
                }
                cb(null, {});
            }
            catch (err) {
                cb(err);
            }
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, results) => {
                if (err)
                    return reject(err);
                resolve(results);
            });
        });
    }
    _onCustomEvent(evt) {
        const eventName = evt.getHeader('Event-Subclass');
        const fullEventName = `CUSTOM ${eventName}`;
        const ev = this._customEvents.find((e) => e === fullEventName);
        if (ev) {
            try {
                const args = JSON.parse(evt.getBody());
                debug(`Endpoint#__onCustomEvent: ${ev} - emitting JSON argument ${evt.getBody()}`);
                this.emit(eventName, args, evt);
            }
            catch (err) {
                if (err instanceof SyntaxError) {
                    this.emit(eventName, evt.getBody(), evt);
                    debug(`Endpoint#__onCustomEvent: ${ev} - emitting text argument ${evt.getBody()}`);
                }
                else {
                    console.error(err, `Error emitting event ${eventName}`);
                }
            }
        }
    }
    play(file, callback) {
        assert_1.default.ok(typeof file === 'string' || typeof file === 'object' || Array.isArray(file), 'file param is required');
        let timeoutSecs = -1;
        if (typeof file === 'object' && !Array.isArray(file)) {
            const fOpts = file;
            assert_1.default.ok(typeof fOpts.file === 'string', 'file is required for PlaybackOptions object');
            if (fOpts.seekOffset && fOpts.seekOffset > 0)
                fOpts.file = `${fOpts.file}@@${fOpts.seekOffset}`;
            if (fOpts.timeoutSecs)
                timeoutSecs = fOpts.timeoutSecs;
            file = fOpts.file;
        }
        const files = Array.isArray(file) ? file : [file];
        const __x = async (cb) => {
            try {
                if (files.length !== 1)
                    await this.execute('set', 'playback_delimiter=!');
                if (timeoutSecs > 0)
                    await this.execute('set', `playback_timeout_sec=${timeoutSecs}`);
                const evt = await this.execute('playback', files.join('!'));
                if (evt.getHeader('Application-Response') === 'FILE NOT FOUND') {
                    throw new Error('File Not Found');
                }
                else {
                    cb(null, {
                        playbackSeconds: evt.getHeader('variable_playback_seconds'),
                        playbackMilliseconds: evt.getHeader('variable_playback_ms'),
                        playbackLastOffsetPos: evt.getHeader('variable_playback_last_offset_pos')
                    });
                }
            }
            catch (err) {
                cb(err);
            }
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    playCollect(opts, callback) {
        assert_1.default.strictEqual(typeof opts, 'object', "'opts' param is required");
        assert_1.default.strictEqual(typeof opts.file, 'string', "'opts.file' param is required");
        const __x = (cb) => {
            opts.min = opts.min || 0;
            opts.max = opts.max || 128;
            opts.tries = opts.tries || 1;
            opts.timeout = opts.timeout || 120000;
            opts.terminators = opts.terminators || '#';
            opts.invalidFile = opts.invalidFile || 'silence_stream://250';
            opts.varName = opts.varName || 'myDigitBuffer';
            opts.regexp = opts.regexp || '\\d+';
            opts.digitTimeout = opts.digitTimeout || 8000;
            const args = ['min', 'max', 'tries', 'timeout', 'terminators', 'file', 'invalidFile', 'varName', 'regexp', 'digitTimeout'].map((prop) => opts[prop]);
            this.execute('play_and_get_digits', args.join(' '), (err, evt) => {
                if (err)
                    return cb(err);
                const application = evt.getHeader('Application');
                if ('play_and_get_digits' !== application) {
                    return cb(new Error(`Unexpected application: ${application}`));
                }
                cb(null, {
                    digits: evt.getHeader(`variable_${opts.varName}`),
                    invalidDigits: evt.getHeader(`variable_${opts.varName}_invalid`),
                    terminatorUsed: evt.getHeader('variable_read_terminator_used'),
                    playbackSeconds: evt.getHeader('variable_playback_seconds'),
                    playbackMilliseconds: evt.getHeader('variable_playback_ms')
                });
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    say(text, opts, callback) {
        assert_1.default.strictEqual(typeof text, 'string', "'text' is required");
        assert_1.default.strictEqual(typeof opts, 'object', "'opts' param is required");
        assert_1.default.strictEqual(typeof opts.sayType, 'string', "'opts.sayType' param is required");
        assert_1.default.strictEqual(typeof opts.sayMethod, 'string', "'opts.sayMethod' param is required");
        opts.lang = opts.lang || 'en';
        opts.sayType = opts.sayType.toUpperCase();
        opts.sayMethod = opts.sayMethod.toLowerCase();
        const args = [];
        ['lang', 'sayType', 'sayMethod', 'gender'].forEach((prop) => {
            if (opts[prop]) {
                args.push(opts[prop]);
            }
        });
        args.push(text);
        const __x = (cb) => {
            this.execute('say', args.join(' '), (err, evt) => {
                if (err)
                    return cb(err);
                const application = evt.getHeader('Application');
                if ('say' !== application)
                    return cb(new Error(`Unexpected application: ${application}`));
                cb(null, {
                    playbackSeconds: evt.getHeader('variable_playback_seconds'),
                    playbackMilliseconds: evt.getHeader('variable_playback_ms')
                });
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    speak(opts, callback) {
        assert_1.default.strictEqual(typeof opts, 'object', "'opts' param is required");
        assert_1.default.strictEqual(typeof opts.ttsEngine, 'string', "'opts.ttsEngine' param is required");
        assert_1.default.strictEqual(typeof opts.voice, 'string', "'opts.voice' param is required");
        assert_1.default.strictEqual(typeof opts.text, 'string', "'opts.text' param is required");
        const __x = (cb) => {
            const args = [opts.ttsEngine, opts.voice, opts.text].join('|');
            this.execute('speak', args, (err, evt) => {
                if (err)
                    return cb(err);
                const application = evt.getHeader('Application');
                if ('speak' !== application)
                    return cb(new Error(`Unexpected application: ${application}`));
                cb(null);
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    join(conf, opts, callback) {
        const confName = typeof conf === 'string' ? conf : conf.name;
        if (typeof opts === 'function') {
            callback = opts;
            opts = {};
        }
        opts = opts || {};
        opts.flags = opts.flags || {};
        const flags = [];
        for (const [key, value] of Object.entries(opts.flags)) {
            if (true === value)
                flags.push((0, snake_case_1.snakeCase)(key).replace(/_/g, '-'));
        }
        let args = confName;
        if (opts.profile)
            args += '@' + opts.profile;
        if (!!opts.pin || flags.length > 0)
            args += '+';
        if (opts.pin)
            args += opts.pin;
        if (flags.length > 0)
            args += '+flags{' + flags.join('|') + '}';
        const __x = (cb) => {
            const listener = this.__onConferenceEvent.bind(this);
            debug(`Endpoint#join: ${this.uuid} executing conference with args: ${args}`);
            this.conn.on('esl::event::CUSTOM::*', listener);
            this.execute('conference', args);
            (0, assert_1.default)(!this._joinCallback);
            this._joinCallback = (memberId, confUuid) => {
                debug(`Endpoint#joinConference: ${this.uuid} joined ${confName}:${confUuid} with memberId ${memberId}`);
                this._joinCallback = undefined;
                this.conf.memberId = memberId;
                this.conf.name = confName;
                this.conf.uuid = confUuid;
                this.conn.removeListener('esl::event::CUSTOM::*', listener);
                cb(null, { memberId, confUuid });
            };
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    bridge(other, callback) {
        const otherUuid = typeof other === 'string' ? other : other.uuid;
        const __x = (cb) => {
            this.api('uuid_bridge', [this.uuid, otherUuid], (err, event, headers, body) => {
                if (err)
                    return cb(err);
                if (body && 0 === body.indexOf('+OK')) {
                    return cb(null);
                }
                cb(new Error(body));
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    unbridge(callback) {
        const __x = (cb) => {
            this.api('uuid_transfer', [this.uuid, '-both', 'park', 'inline'], (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (0 === body.indexOf('+OK')) {
                    return cb(null);
                }
                cb(new Error(body));
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    getNonMatchingConfParticipants(confName, tag, callback) {
        const __x = (cb) => {
            const args = [confName, 'gettag', tag, 'nomatch'];
            this.api('conference', args, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody().trim()
                    .split(',')
                    .map((v) => parseInt(v, 10))
                    .filter((v) => !isNaN(v));
                cb(null, body);
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    setGain(opts, callback) {
        const __x = (cb) => {
            const db = (0, utils_1.parseDecibels)(opts);
            const args = [this.uuid, 'setGain', db.toString()];
            this.api('uuid_dub', args, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (0 === body.indexOf('+OK')) {
                    return cb(null);
                }
                cb(new Error(body));
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    dub(opts, callback) {
        const { action, track, play, say, loop, gain } = opts;
        assert_1.default.ok(action, 'ep#dub: action is required');
        assert_1.default.ok(track, 'ep#dub: track is required');
        const __x = (cb) => {
            const args = [this.uuid, action, track];
            if (action === 'playOnTrack') {
                args.push(play);
                args.push(loop ? 'loop' : 'once');
                if (gain)
                    args.push(gain);
            }
            else if (action === 'sayOnTrack') {
                args.push(say);
                args.push(loop ? 'loop' : 'once');
                if (gain)
                    args.push(gain);
            }
            this.api('uuid_dub', `^^|${args.join('|')}`, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (0 === body.indexOf('+OK')) {
                    return cb(null);
                }
                cb(new Error(body));
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    startTranscription(opts, callback) {
        opts = opts || {};
        let apiCall, bugname;
        if (opts.vendor.startsWith('custom:')) {
            apiCall = 'uuid_jambonz_transcribe';
            bugname = `${opts.vendor}_transcribe`;
        }
        else {
            let vendor = opts.vendor;
            if (vendor === 'microsoft')
                vendor = 'azure';
            if (vendor === 'polly')
                vendor = 'aws';
            apiCall = `uuid_${vendor}_transcribe`;
            bugname = `${vendor}_transcribe`;
        }
        const type = opts.interim === true ? 'interim' : 'final';
        const channels = opts.channels === 2 ? 'stereo' : 'mono';
        const __x = (cb) => {
            const args = opts.hostport ?
                [this.uuid, 'start', opts.hostport, opts.locale || 'en-US', type, channels, opts.bugname || bugname] :
                [this.uuid, 'start', opts.locale || 'en-US', type, channels, opts.bugname || bugname];
            if (opts.prompt) {
                const a = args.concat(opts.prompt);
                this.api(apiCall, `^^|${a.join('|')}`, (err, evt) => {
                    if (err)
                        return cb(err);
                    const body = evt.getBody();
                    if (0 === body.indexOf('+OK'))
                        return cb(null);
                    cb(new Error(body));
                });
            }
            else {
                this.api(apiCall, args, (err, evt) => {
                    if (err)
                        return cb(err);
                    const body = evt.getBody();
                    if (0 === body.indexOf('+OK'))
                        return cb(null);
                    cb(new Error(body));
                });
            }
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    startTranscriptionTimers(opts, callback) {
        if (typeof opts === 'function') {
            callback = opts;
            opts = { vendor: 'nuance' };
        }
        let apiCall = '', bugname = '';
        switch (opts.vendor) {
            case 'nuance':
                apiCall = 'uuid_nuance_transcribe';
                bugname = 'nuance_transcribe';
                break;
            default:
                break;
        }
        const __x = (cb) => {
            this.api(apiCall, [this.uuid, 'start_timers', opts.bugname || bugname], (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (0 === body.indexOf('+OK'))
                    return cb(null);
                cb(new Error(body));
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    stopTranscription(opts, callback) {
        if (typeof opts === 'function') {
            callback = opts;
            opts = { vendor: 'google' };
        }
        let apiCall, bugname;
        if (opts.vendor.startsWith('custom:')) {
            apiCall = 'uuid_jambonz_transcribe';
            bugname = `${opts.vendor}_transcribe`;
        }
        else {
            let vendor = opts.vendor;
            if (vendor === 'microsoft')
                vendor = 'azure';
            if (vendor === 'polly')
                vendor = 'aws';
            apiCall = `uuid_${vendor}_transcribe`;
            bugname = `${vendor}_transcribe`;
        }
        const __x = (cb) => {
            const args = [this.uuid, 'stop', opts.bugname || bugname];
            this.api(apiCall, args, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (0 === body.indexOf('+OK'))
                    return cb(null);
                cb(new Error(body));
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    startVadDetection(opts, callback) {
        opts = opts || {};
        const vendor = opts.vendor || 'native';
        const apiCall = vendor === 'native' ? 'uuid_vad_detect' : 'uuid_vad_silero';
        const strategy = opts.strategy || 'continuous';
        const mode = opts.mode || 2;
        const silenceMs = opts.silenceMs || 100;
        const voiceMs = opts.voiceMs || 250;
        const threshold = opts.threshold || 0.5;
        const speechPadMs = opts.speechPadMs || 30;
        const bugname = opts.bugname || (vendor === 'native' ? 'vad_detection' : 'vad_detection_silero');
        const __x = (cb) => {
            const args = vendor === 'native' ?
                [this.uuid, 'start', strategy, mode, silenceMs, voiceMs, bugname] :
                [this.uuid, 'start', strategy, threshold, silenceMs, voiceMs, speechPadMs, bugname];
            this.api(apiCall, args, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (0 === body.indexOf('+OK'))
                    return cb(null);
                cb(new Error(body));
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    stopVadDetection(opts, callback) {
        opts = opts || {};
        const vendor = opts.vendor || 'native';
        const apiCall = vendor === 'native' ? 'uuid_vad_detect' : 'uuid_vad_silero';
        const bugname = opts.bugname || (vendor === 'native' ? 'vad_detection' : 'vad_detection_silero');
        const __x = (cb) => {
            const args = [this.uuid, 'stop', bugname];
            this.api(apiCall, args, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (0 === body.indexOf('+OK'))
                    return cb(null);
                cb(new Error(body));
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    forkAudioStart(opts, callback) {
        assert_1.default.ok(typeof opts.wsUrl === 'string', 'opts.wsUrl is required');
        const sampling = opts.sampling || '8000';
        const mix = opts.mixType || 'mono';
        assert_1.default.ok(['mono', 'mixed', 'stereo'].includes(mix), "opts.mixType must be 'mono', 'mixed', 'stereo'");
        const __x = (cb) => {
            const args = [this.uuid, 'start', opts.wsUrl, mix, sampling];
            args.push(opts.bugname || '');
            if (opts.metadata) {
                const text = typeof opts.metadata === 'string' ? `'${opts.metadata}'` : `'${JSON.stringify(opts.metadata)}'`;
                args.push(text);
            }
            else {
                args.push('');
            }
            args.push(opts.bidirectionalAudio ? opts.bidirectionalAudio.enabled || 'true' : 'true');
            args.push(opts.bidirectionalAudio ? opts.bidirectionalAudio.streaming || 'false' : 'false');
            args.push(opts.bidirectionalAudio ? opts.bidirectionalAudio.sampleRate || '' : '');
            this.api('uuid_audio_fork', `^^|${args.join('|')}`, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (0 === body.indexOf('+OK'))
                    return cb(null);
                cb(new Error(body));
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    forkAudioSendText(bugname, metadata, callback) {
        const args = [this.uuid, 'send_text'];
        if (arguments.length === 1 && typeof bugname === 'function') {
            callback = bugname;
            bugname = null;
            metadata = null;
        }
        else if (arguments.length === 1) {
            if (typeof bugname === 'object' || bugname.startsWith('{') || bugname.startsWith('[')) {
                metadata = bugname;
                bugname = null;
            }
            else {
                metadata = null;
            }
        }
        else if (arguments.length === 2) {
            if (typeof metadata === 'function') {
                callback = metadata;
                if (typeof bugname === 'object' || bugname.startsWith('{') || bugname.startsWith('[')) {
                    metadata = bugname;
                    bugname = null;
                }
                else {
                    metadata = null;
                }
            }
        }
        (0, assert_1.default)(callback === undefined || typeof callback === 'function', 'callback must be a function');
        if (metadata && typeof metadata === 'object')
            metadata = `'${JSON.stringify(metadata)}'`;
        else if (metadata)
            metadata = `'${metadata}'`;
        if (bugname)
            args.push(bugname);
        args.push(metadata);
        const __x = (cb) => {
            this.api('uuid_audio_fork', args, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (0 === body.indexOf('+OK'))
                    return cb(null);
                cb(new Error(body));
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    forkAudioStop(bugname, metadata, callback) {
        const args = [this.uuid, 'stop'];
        if (arguments.length === 1 && typeof bugname === 'function') {
            callback = bugname;
            bugname = null;
            metadata = null;
        }
        else if (arguments.length === 1) {
            if (typeof bugname === 'object' || bugname.startsWith('{') || bugname.startsWith('[')) {
                metadata = bugname;
                bugname = null;
            }
            else {
                metadata = null;
            }
        }
        else if (arguments.length === 2) {
            if (typeof metadata === 'function') {
                callback = metadata;
                if (typeof bugname === 'object' || bugname.startsWith('{') || bugname.startsWith('[')) {
                    metadata = bugname;
                    bugname = null;
                }
                else {
                    metadata = null;
                }
            }
        }
        (0, assert_1.default)(callback === undefined || typeof callback === 'function', 'callback must be a function');
        if (metadata && typeof metadata === 'object')
            metadata = `'${JSON.stringify(metadata)}'`;
        else if (metadata)
            metadata = `'${metadata}'`;
        if (bugname)
            args.push(bugname);
        if (metadata)
            args.push(metadata);
        const __x = (cb) => {
            debug(`calling uuid_audio_fork with args ${JSON.stringify(args)}`);
            this.api('uuid_audio_fork', args, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (0 === body.indexOf('+OK'))
                    return cb(null);
                cb(new Error(body));
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    forkAudioPause(bugname, silence, callback) {
        const args = [this.uuid, 'pause'];
        if (arguments.length === 1) {
            if (typeof bugname === 'function') {
                callback = bugname;
                bugname = null;
                silence = false;
            }
            else if (typeof bugname === 'boolean') {
                silence = bugname;
                bugname = null;
            }
            else {
                silence = false;
            }
        }
        else if (arguments.length === 2) {
            if (typeof silence === 'function') {
                callback = silence;
                if (typeof bugname === 'boolean') {
                    silence = bugname;
                    bugname = null;
                }
                else {
                    silence = false;
                }
            }
        }
        if (bugname) {
            args.push(bugname);
            args.push(silence ? 'silence' : 'blank');
        }
        const __x = (cb) => {
            debug(`calling uuid_audio_fork with args ${JSON.stringify(args)}`);
            this.api('uuid_audio_fork', args, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (0 === body.indexOf('+OK'))
                    return cb(null);
                cb(new Error(body));
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    forkAudioResume(bugname, callback) {
        const args = [this.uuid, 'resume'];
        if (arguments.length === 1) {
            if (typeof bugname === 'function') {
                callback = bugname;
                bugname = null;
            }
        }
        if (bugname)
            args.push(bugname);
        const __x = (cb) => {
            debug(`calling uuid_audio_fork with args ${JSON.stringify(args)}`);
            this.api('uuid_audio_fork', args, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (0 === body.indexOf('+OK'))
                    return cb(null);
                cb(new Error(body));
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    mute(callback) {
        this._muted = true;
        return this.execute('set_mute', 'read true', callback);
    }
    unmute(callback) {
        this._muted = false;
        return this.execute('set_mute', 'read false', callback);
    }
    toggleMute(callback) {
        this._muted = !this._muted;
        return this.execute('set_mute', `read ${this._muted ? 'true' : 'false'}`, callback);
    }
    api(command, args, callback) {
        if (typeof args === 'function') {
            callback = args;
            args = [];
        }
        const __x = (cb) => {
            if (!this._conn)
                return cb(new Error('endpoint no longer active'));
            debug(`Endpoint#api ${command} ${args || ''}`);
            this._conn.api(command, args || "", (...response) => {
                debug(`Endpoint#api response: ${JSON.stringify(response).slice(0, 512)}`);
                cb(null, ...response);
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, response) => {
                if (err)
                    return reject(err);
                resolve(response);
            });
        });
    }
    execute(app, arg, callback) {
        if (typeof arg === 'function') {
            callback = arg;
            arg = '';
        }
        const __x = (cb) => {
            if (!this._conn)
                return cb(new Error('endpoint no longer active'));
            debug(`Endpoint#execute ${app} ${arg}`);
            this._conn.execute(app, arg, (evt) => {
                cb(null, evt);
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, response) => {
                if (err)
                    return reject(err);
                resolve(response);
            });
        });
    }
    executeAsync(app, arg, callback) {
        return this._conn?.execute(app, arg, callback);
    }
    modify(newSdp) {
        let result;
        return this._dialog?.modify(newSdp)
            .then((res) => {
            result = res;
            return this.getChannelVariables(true);
        })
            .then((obj) => {
            this.local.sdp = obj['variable_rtp_local_sdp_str'];
            this.local.mediaIp = obj['variable_local_media_ip'];
            this.local.mediaPort = obj['variable_local_media_port'];
            this.remote.sdp = obj['variable_switch_r_sdp'];
            this.remote.mediaIp = obj['variable_remote_media_ip'];
            this.remote.mediaPort = obj['variable_remote_media_port'];
            this.dtmfType = obj['variable_dtmf_type'];
            return result;
        });
    }
    destroy(callback) {
        const __x = (cb) => {
            if (State.CONNECTED !== this.state) {
                return cb(null);
            }
            this.state = State.DISCONNECTED;
            if (!this.conn) {
                this._dialog = null;
                return cb(null);
            }
            this.dialog.once('destroy', () => {
                debug(`Endpoint#destroy - received BYE for ${this.uuid}`);
                cb(null);
                this._dialog = null;
            });
            debug(`Endpoint#destroy: executing hangup on ${this.uuid}`);
            this.execute('hangup', (err) => {
                if (err) {
                    debug(`got error hanging up endpoint ${this.uuid}: ${err.message}`);
                    cb(err);
                }
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    recordSession(...args) {
        return this._endpointApps('record_session', ...args);
    }
    _endpointApps(app, ...args) {
        const len = args.length;
        let argList = args;
        let callback = null;
        if (len > 0 && typeof args[len - 1] === 'function') {
            argList = args.slice(0, len - 1);
            callback = args[len - 1];
        }
        const __x = (cb) => {
            this.execute(app, argList.join(' '), cb);
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    record(file, opts, callback) {
        if (typeof opts === 'function') {
            callback = opts;
            opts = {};
        }
        opts = opts || {};
        const args = [];
        ['timeLimitSecs', 'silenceThresh', 'silenceHits'].forEach((p) => {
            const val = opts[p];
            if (val !== undefined) {
                args.push(val.toString());
            }
        });
        const __x = (cb) => {
            this.execute('record', `${file} ${args.join(' ')}`, (err, evt) => {
                if (err)
                    return cb(err, evt);
                const application = evt.getHeader('Application');
                if ('record' !== application) {
                    return cb(new Error(`Unexpected application in record response: ${application}`));
                }
                cb(null, {
                    terminatorUsed: evt.getHeader('variable_playback_terminator_used'),
                    recordSeconds: evt.getHeader('variable_record_seconds'),
                    recordMilliseconds: evt.getHeader('variable_record_ms'),
                    recordSamples: evt.getHeader('variable_record_samples')
                });
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    // conference member operations
    _confOp(op, args, callback) {
        if (typeof args === 'function') {
            callback = args;
            args = '';
        }
        args = args || '';
        if (Array.isArray(args))
            args = args.join(' ');
        const __x = (cb) => {
            if (!this.conf.memberId)
                return cb(new Error('Endpoint not in conference'));
            this.api('conference', `${this.conf.name} ${op} ${this.conf.memberId} ${args}`, (err, evt) => {
                if (err)
                    return cb(err, evt);
                const body = evt.getBody();
                if (-1 !== ['mute', 'deaf', 'unmute', 'undeaf', 'kick', 'tmute', 'vmute', 'unvmute', 'vmute-snap', 'dtmf'].indexOf(op)) {
                    if (/OK\s+/.test(body))
                        return cb(err, body);
                    return cb(new Error(body));
                }
                return cb(err, evt);
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    confMute(args, callback) { return this._confOp('mute', args, callback); }
    confUnmute(args, callback) { return this._confOp('unmute', args, callback); }
    confDeaf(args, callback) { return this._confOp('deaf', args, callback); }
    confUndeaf(args, callback) { return this._confOp('undeaf', args, callback); }
    confKick(args, callback) { return this._confOp('kick', args, callback); }
    confHup(args, callback) { return this._confOp('hup', args, callback); }
    unjoin(args, callback) { return this.confKick(args, callback); }
    confTmute(args, callback) { return this._confOp('tmute', args, callback); }
    confVmute(args, callback) { return this._confOp('vmute', args, callback); }
    confUnvmute(args, callback) { return this._confOp('unvmute', args, callback); }
    confVmuteSnap(args, callback) { return this._confOp('vmute-snap', args, callback); }
    confSaymember(args, callback) { return this._confOp('saymember', args, callback); }
    confDtmf(args, callback) { return this._confOp('dtmf', args, callback); }
    confPlay(file, opts, callback) {
        debug(`Endpoint#confPlay endpoint ${this.uuid} memberId ${this.conf.memberId}`);
        assert_1.default.ok(typeof file === 'string', "'file' is required and must be a file to play");
        if (typeof opts === 'function') {
            callback = opts;
            opts = {};
        }
        opts = opts || {};
        const __x = (cb) => {
            if (!this.conf.memberId)
                return cb(new Error('Endpoint not in conference'));
            const args = [];
            if (opts.vol)
                args.push('vol=' + opts.volume);
            if (opts.fullScreen)
                args.push('full-screen=' + opts.fullScreen);
            if (opts.pngMs)
                args.push('png_ms=' + opts.pngMs);
            const s1 = args.length ? args.join(',') + ' ' : '';
            const cmdArgs = `${this.conf.name} play ${file} ${s1} ${this.conf.memberId}`;
            this.api('conference', cmdArgs, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (/Playing file.*to member/.test(body))
                    return cb(null, evt);
                cb(new Error(body));
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, results) => {
                if (err)
                    return reject(err);
                resolve(results);
            });
        });
    }
    transfer(newConf, callback) {
        const confName = newConf instanceof conference_1.default ? newConf.name : newConf;
        assert_1.default.ok(typeof confName === 'string', "'newConf' is required");
        const __x = (cb) => {
            if (!this.conf.memberId)
                return cb(new Error('Endpoint not in conference'));
            this.api('conference', `${this.conf.name} transfer ${confName} ${this.conf.memberId}`, (err, evt) => {
                if (err)
                    return cb(err, evt);
                const body = evt.getBody();
                if (/OK Member.*sent to conference/.test(body))
                    return cb(null, body);
                cb(new Error(body));
            });
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, result) => {
                if (err)
                    return reject(err);
                resolve(result);
            });
        });
    }
    __onConferenceEvent(evt) {
        const subclass = evt.getHeader('Event-Subclass');
        if (subclass === 'conference::maintenance') {
            const action = evt.getHeader('Action');
            debug(`Endpoint#__onConferenceEvent: conference event action: ${action}`);
            if (action === 'add-member') {
                this._onAddMember(evt);
            }
            else {
                this._unhandled(evt);
            }
        }
        else {
            debug(`Endpoint#__onConferenceEvent: got unhandled custom event: ${subclass}`);
        }
    }
    _onAddMember(evt) {
        let memberId = -1;
        const confUuid = evt.getHeader('Conference-Unique-ID');
        try {
            memberId = parseInt(evt.getHeader('Member-ID'), 10);
        }
        catch {
            debug(`Endpoint#_onAddMember: error parsing memberId as an int: ${memberId}`);
        }
        debug(`Endpoint#_onAddMember: memberId ${memberId} conference uuid ${confUuid}`);
        if (this._joinCallback) {
            this._joinCallback(memberId, confUuid);
        }
    }
    _unhandled(evt) {
        debug(`unhandled Conference event for endpoint ${this.uuid} with action: ${evt.getHeader('Action')}`);
    }
    _onError(err) {
        if (err.errno && (err.errno === 'ECONNRESET' || err.errno === 'EPIPE') && this.state === State.DISCONNECTED) {
            debug('ignoring connection reset error during teardown of connection');
            return;
        }
        console.error(`Endpoint#_onError: uuid: ${this.uuid}: ${err}`);
    }
    _onChannelCallState(evt) {
        const channelCallState = evt.getHeader('Channel-Call-State');
        debug(`Endpoint#_onChannelCallState ${this.uuid}: Channel-Call-State: ${channelCallState}`);
        if (State.NOT_CONNECTED === this.state && 'EARLY' === channelCallState) {
            this.state = State.EARLY;
            if (this.secure) {
                this.getChannelVariables(true, (err, obj) => {
                    this.local.sdp = obj['variable_rtp_local_sdp_str'];
                    this.local.mediaIp = obj['variable_local_media_ip'];
                    this.local.mediaPort = obj['variable_local_media_port'];
                    this.remote.sdp = obj['variable_switch_r_sdp'];
                    this.remote.mediaIp = obj['variable_remote_media_ip'];
                    this.remote.mediaPort = obj['variable_remote_media_port'];
                    this.dtmfType = obj['variable_dtmf_type'];
                    this.sip.callId = obj['variable_sip_call_id'];
                    this._emitReady();
                });
            }
        }
        if ('HANGUP' === channelCallState && State.CONNECTED === this.state) {
            debug(`Endpoint#_onChannelCallState ${this.uuid}: got BYE from Freeswitch end of call`);
            this.state = State.DISCONNECTED;
            const reason = evt.getHeader('Hangup-Cause');
            this.emit('destroy', { reason });
        }
        this.emit('channelCallState', { state: channelCallState });
    }
    _onDtmf(evt) {
        if ('DTMF' === evt.getHeader('Event-Name')) {
            const args = {
                dtmf: evt.getHeader('DTMF-Digit'),
                duration: evt.getHeader('DTMF-Duration'),
                source: evt.getHeader('DTMF-Source')
            };
            if (evt.getHeader('DTMF-SSRC'))
                args.ssrc = evt.getHeader('DTMF-SSRC');
            if (evt.getHeader('DTMF-Timestamp'))
                args.timestamp = evt.getHeader('DTMF-Timestamp');
            this.emit('dtmf', args);
        }
    }
    _onToneDetect(evt) {
        let tone = evt.getHeader('Detected-Tone');
        if (!tone && evt.getHeader('Detected-Fax-Tone') === 'true')
            tone = 'fax';
        this.emit('tone', { tone });
    }
    _onPlaybackStart(evt) {
        if (evt.getHeader('Playback-File-Type') === 'tts_stream') {
            let header;
            const opts = {};
            evt.firstHeader();
            do {
                header = evt.nextHeader();
                if (header && header.startsWith('variable_tts_'))
                    opts[header] = evt.getHeader(header);
            } while (header);
            this.emit('playback-start', opts);
        }
        else {
            this.emit('playback-start', { file: evt.getHeader('Playback-File-Path') });
        }
    }
    _onPlaybackStop(evt) {
        if (evt.getHeader('Playback-File-Type') === 'tts_stream') {
            let header;
            const opts = {};
            evt.firstHeader();
            do {
                header = evt.nextHeader();
                if (header && header.startsWith('variable_tts_'))
                    opts[header] = evt.getHeader(header);
            } while (header);
            this.emit('playback-stop', opts);
        }
        else {
            this.emit('playback-stop', { file: evt.getHeader('Playback-File-Path') });
        }
    }
    _emitReady() {
        if (!this._ready) {
            this._ready = true;
            setImmediate(() => {
                this.emit('ready');
            });
        }
    }
    _onHangup(evt) {
        // left intentionally empty matching original implementation
    }
    _onBye(evt) {
        debug('Endpoint#_onBye: got BYE from media server');
        this.emit('destroy');
    }
    toJSON() {
        return (0, utils_1.pick)(this, 'sip local remote uuid');
    }
    toString() {
        return JSON.stringify(this.toJSON());
    }
}
module.exports = Endpoint;
