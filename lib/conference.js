"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const events_1 = require("events");
const assert_1 = __importDefault(require("assert"));
const utils_1 = require("./utils");
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('drachtio:fsmrf');
const CONF_ACTION_MAP = new Map([
    ['add-member', { event: 'addMember', handler: '_onAddMember' }],
    ['del-member', { event: 'delMember', handler: '_onDelMember' }],
    ['start-talking', { event: 'startTalking', handler: '_onStartTalking' }],
    ['stop-talking', { event: 'stopTalking', handler: '_onStopTalking' }],
    ['mute-detect', { event: 'muteDetect', handler: '_onMuteDetect' }],
    ['unmute-member', { event: 'unmuteMember', handler: '_onUnmuteMember' }],
    ['mute-member', { event: 'muteMember', handler: '_onMuteMember' }],
    ['kick-member', { event: 'kickMember', handler: '_onKickMember' }],
    ['dtmf-member', { event: 'dtmfMember', handler: '_onDtmfMember' }],
    ['start-recording', { event: 'startRecording', handler: '_onStartRecording' }],
    ['stop-recording', { event: 'stopRecording', handler: '_onStopRecording' }],
    ['play-file', { event: 'playFile', handler: '_onPlayFile' }],
    ['play-file-member', { event: 'playFileMember', handler: '_onPlayFileMember' }],
    ['play-file-done', { event: 'playFileDone', handler: '_onPlayFileDone' }],
    ['lock', { event: 'lock', handler: '_onLock' }],
    ['unlock', { event: 'unlock', handler: '_onUnlock' }],
    ['transfer', { event: 'transfer', handler: '_onTransfer' }],
    ['record', { event: 'record', handler: '_onRecord' }]
]);
var State;
(function (State) {
    State[State["NOT_CREATED"] = 1] = "NOT_CREATED";
    State[State["CREATED"] = 2] = "CREATED";
    State[State["DESTROYED"] = 3] = "DESTROYED";
})(State || (State = {}));
function unhandled(evt) {
    debug(`unhandled conference event: ${evt.getHeader('Action')}`);
}
class Conference extends events_1.EventEmitter {
    _endpoint;
    name;
    uuid;
    recordFile;
    state;
    locked;
    memberId;
    participants;
    maxMembers;
    _playCommands;
    constructor(name, uuid, endpoint, opts) {
        super();
        debug('Conference#ctor');
        opts = opts || {};
        this._endpoint = endpoint;
        this.name = name;
        this.uuid = uuid;
        this.recordFile = null;
        this.state = State.CREATED;
        this.locked = false;
        this.memberId = this.endpoint.conf.memberId ?? -1;
        this.participants = new Map();
        this.maxMembers = -1;
        this._playCommands = {};
        this.endpoint.filter('Conference-Unique-ID', this.uuid);
        this.endpoint.conn.on('esl::event::CUSTOM::*', this.__onConferenceEvent.bind(this));
        if (opts.maxMembers) {
            this.endpoint.api('conference', `${name} set max_members ${opts.maxMembers}`);
            this.maxMembers = opts.maxMembers;
        }
    }
    get endpoint() {
        return this._endpoint;
    }
    get mediaserver() {
        return this.endpoint.mediaserver;
    }
    destroy(callback) {
        debug(`Conference#destroy - destroying conference ${this.name}`);
        const __x = (cb) => {
            this.endpoint.destroy(cb);
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err) => {
                if (err)
                    return reject(err);
                resolve();
            });
        });
    }
    getSize() {
        return this.list('count').then((res) => {
            try {
                if (typeof res === 'number')
                    return res;
                return parseInt(String(res), 10);
            }
            catch (err) {
                throw new Error(`unexpected (non-integer) response to conference list summary: ${err}`);
            }
        });
    }
    _execOp(op, args, callback) {
        if (typeof args === 'function') {
            callback = args;
            args = '';
        }
        args = args || '';
        if (Array.isArray(args))
            args = args.join(' ');
        const __x = (cb) => {
            this.endpoint.api('conference', `${this.name} ${op} ${args}`, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (['lock', 'unlock', 'mute', 'deaf', 'unmute', 'undeaf'].includes(op)) {
                    if (/OK\s+/.test(body))
                        return cb(err, body);
                    return cb(new Error(body));
                }
                return cb(err, body);
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
    agc(args, callback) { return this._execOp('agc', args || '', callback); }
    list(args, callback) { return this._execOp('list', args || '', callback); }
    lock(args, callback) { return this._execOp('lock', args || '', callback); }
    unlock(args, callback) { return this._execOp('unlock', args || '', callback); }
    mute(args, callback) { return this._execOp('mute', args || '', callback); }
    deaf(args, callback) { return this._execOp('deaf', args || '', callback); }
    unmute(args, callback) { return this._execOp('unmute', args || '', callback); }
    undeaf(args, callback) { return this._execOp('undeaf', args || '', callback); }
    chkRecord(args, callback) { return this._execOp('chkRecord', args || '', callback); }
    set(param, value, callback) {
        debug(`Conference#setParam: conference ${this.name} set ${param} ${value}`);
        const __x = (cb) => {
            this.endpoint.api('conference', `${this.name} set ${param} ${value}`, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                return cb(err, body);
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
    get(param, callback) {
        debug(`Conference#getParam: conference ${this.name} get ${param}`);
        const __x = (cb) => {
            this.endpoint.api('conference', `${this.name} get ${param}`, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                const res = /^\d+$/.test(body) ? parseInt(body, 10) : body;
                return cb(err, res);
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
    startRecording(file, callback) {
        assert_1.default.ok(typeof file === 'string', "'file' parameter must be provided");
        const __x = (cb) => {
            this.recordFile = file;
            this.endpoint.api('conference', `${this.name} recording start ${file}`, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (body.includes(`Record file ${file}`)) {
                    return cb(null, body);
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
    pauseRecording(file, callback) {
        const __x = (cb) => {
            this.recordFile = file;
            this.endpoint.api('conference', `${this.name} recording pause ${this.recordFile}`, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (body.includes(`Pause recording file ${file}`)) {
                    return cb(null, body);
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
    resumeRecording(file, callback) {
        const __x = (cb) => {
            this.recordFile = file;
            this.endpoint.api('conference', `${this.name} recording resume ${this.recordFile}`, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (body.includes(`Resume recording file ${file}`)) {
                    return cb(null, body);
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
    stopRecording(file, callback) {
        const __x = (cb) => {
            this.endpoint.api('conference', `${this.name} recording stop ${this.recordFile}`, (err, evt) => {
                if (err)
                    return cb(err);
                const body = evt.getBody();
                if (body.includes(`Stopped recording file ${file}`)) {
                    return cb(null, body);
                }
                cb(new Error(body));
            });
            this.recordFile = null;
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
    play(file, callback) {
        assert_1.default.ok(typeof file === 'string' || Array.isArray(file), 'file param is required and must be a string or array');
        const __x = async (cb) => {
            const files = typeof file === 'string' ? [file] : file;
            const queued = [];
            for (const f of files) {
                try {
                    const result = await this.endpoint.api('conference', `${this.name} play ${f}`);
                    if (result && result.getBody() && -1 !== result.getBody().indexOf(' not found.')) {
                        debug(`file ${f} was not queued because it was not found, or conference is empty`);
                    }
                    else {
                        queued.push(f);
                    }
                }
                catch {
                }
            }
            if (queued.length > 0) {
                const firstFile = queued[0];
                const obj = {
                    remainingFiles: queued.slice(1),
                    seconds: 0,
                    milliseconds: 0,
                    samples: 0,
                    done: cb
                };
                this._playCommands[firstFile] = this._playCommands[firstFile] || [];
                this._playCommands[firstFile].push(obj);
            }
            else {
                debug('Conference#play: no files were queued for callback, so invoking callback immediately');
                cb(null, {
                    seconds: 0,
                    milliseconds: 0,
                    samples: 0
                });
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
    _onAddMember(evt) {
        debug('Conference#_onAddMember: %O', this);
        const size = parseInt(evt.getHeader('Conference-Size'), 10);
        const newMemberId = parseInt(evt.getHeader('Member-ID'), 10);
        const memberType = evt.getHeader('Member-Type');
        const memberGhost = evt.getHeader('Member-Ghost');
        const channelUuid = evt.getHeader('Channel-Call-UUID');
        const obj = {
            memberId: newMemberId,
            type: memberType,
            ghost: memberGhost,
            channelUuid: channelUuid
        };
        this.participants.set(newMemberId, obj);
        debug(`Conference#_onAddMember: added member ${newMemberId} to ${this.name} size is ${size}`);
    }
    _onDelMember(evt) {
        const memberId = parseInt(evt.getHeader('Member-ID'), 10);
        const size = parseInt(evt.getHeader('Conference-Size'), 10);
        this.participants.delete(memberId);
        debug(`Conference#_onDelMember: removed member ${memberId} from ${this.name} size is ${size}`);
    }
    _onStartTalking(evt) {
        debug(`Conf ${this.name}:${this.uuid} member ${evt.getHeader('Member-ID')} started talking`);
    }
    _onStopTalking(evt) {
        debug(`Conf ${this.name}:${this.uuid}  member ${evt.getHeader('Member-ID')} stopped talking`);
    }
    _onMuteDetect(evt) {
        debug(`Conf ${this.name}:${this.uuid}  muted member ${evt.getHeader('Member-ID')} is talking`);
    }
    _onUnmuteMember(evt) {
        debug(`Conf ${this.name}:${this.uuid}  member ${evt.getHeader('Member-ID')} has been unmuted`);
    }
    _onMuteMember(evt) {
        debug(`Conf ${this.name}:${this.uuid}  member ${evt.getHeader('Member-ID')} has been muted`);
    }
    _onKickMember(evt) {
        debug(`Conf ${this.name}:${this.uuid}  member ${evt.getHeader('Member-ID')} has been kicked`);
    }
    _onDtmfMember(evt) {
        debug(`Conf ${this.name}:${this.uuid}  member ${evt.getHeader('Member-ID')} has entered DTMF`);
    }
    _onStartRecording(evt) {
        debug('Conference#_onStartRecording: %s:%s  %O', this.name, this.uuid, evt);
        const err = evt.getHeader('Error');
        if (err) {
            const path = evt.getHeader('Path');
            console.log(`Conference#_onStartRecording: failed to start recording to ${path}: ${err}`);
        }
    }
    _onStopRecording(evt) {
        debug('Conference#_onStopRecording: %s:%s  %O', this.name, this.uuid, evt);
    }
    _onPlayFile(evt) {
        const confName = evt.getHeader('Conference-Name');
        const file = evt.getHeader('File');
        debug(`conference-level play has started: ${confName}: ${file}`);
    }
    _onPlayFileMember(evt) {
        debug(`member-level play for member ${evt.getHeader('Member-ID')} has completed`);
    }
    _onPlayFileDone(evt) {
        const confName = evt.getHeader('Conference-Name');
        const file = evt.getHeader('File');
        const seconds = parseInt(evt.getHeader('seconds'), 10);
        const milliseconds = parseInt(evt.getHeader('milliseconds'), 10);
        const samples = parseInt(evt.getHeader('samples'), 10);
        debug(`conference-level play has completed: ${confName}: ${file} ${seconds} seconds, ${milliseconds} milliseconds, ${samples} samples`);
        const el = this._playCommands[file];
        if (el) {
            (0, assert_1.default)(Array.isArray(el), 'Conference#onPlayFileDone: this._playCommands must be an array');
            const obj = el[0];
            obj.seconds += seconds;
            obj.milliseconds += milliseconds;
            obj.samples += samples;
            if (obj.remainingFiles.length === 0) {
                if (obj.done)
                    obj.done(null, {
                        seconds: obj.seconds,
                        milliseconds: obj.milliseconds,
                        samples: obj.samples
                    });
            }
            else {
                const firstFile = obj.remainingFiles[0];
                obj.remainingFiles = obj.remainingFiles.slice(1);
                this._playCommands[firstFile] = this._playCommands[firstFile] || [];
                this._playCommands[firstFile].push(obj);
            }
            this._playCommands[file] = this._playCommands[file].slice(1);
            if (this._playCommands[file].length === 0) {
                delete this._playCommands[file];
            }
        }
    }
    _onLock(evt) {
        debug('conference has been locked: %O', evt);
    }
    _onUnlock(evt) {
        debug('conference has been unlocked: %O', evt);
    }
    _onTransfer(evt) {
        debug('member has been transferred to another conference: %O', evt);
    }
    _onRecord(evt) {
        debug(`conference record has started or stopped: ${evt}`);
    }
    __onConferenceEvent(evt) {
        const subclass = evt.getHeader('Event-Subclass');
        if (subclass === 'conference::maintenance') {
            const action = evt.getHeader('Action');
            debug(`Conference#__onConferenceEvent: conference event action: ${action}`);
            const mapping = CONF_ACTION_MAP.get(action);
            if (mapping) {
                this.emit(mapping.event, evt);
                this[mapping.handler](evt);
            }
            else {
                unhandled(evt);
            }
        }
        else {
            debug(`Conference#__onConferenceEvent: got unhandled custom event: ${subclass}`);
        }
    }
    toJSON() {
        return (0, utils_1.pick)(this, 'name state uuid memberId confConn endpoint maxMembers locked recordFile');
    }
    toString() {
        return JSON.stringify(this.toJSON());
    }
}
module.exports = Conference;
