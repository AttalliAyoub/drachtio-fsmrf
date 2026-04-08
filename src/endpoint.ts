import { EslConnection, EslEvent, EslServer, Srf, SrfDialog, SrfRequest, SrfResponse } from "./types";
import assert from 'assert';
import { EventEmitter } from 'events';
import Conference from './conference';
import { parseBodyText, parseDecibels, pick } from './utils';
import { snakeCase } from 'snake-case';
import createDebug from 'debug';
import MediaServer = require('./mediaserver');

const debug = createDebug('drachtio:fsmrf');

enum State {
  NOT_CONNECTED = 1,
  EARLY = 2,
  CONNECTED = 3,
  DISCONNECTED = 4
}

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

namespace Endpoint {
  export interface CreateOptions {
    debugDir?: string;
    codecs?: string | string[];
    is3pcc?: boolean;
    customEvents?: string[];
    [key: string]: unknown;
  }

  export interface PlaybackOptions {
    file: string;
    seekOffset?: number;
    timeoutSecs?: number;
  }

  export interface PlayCollectOptions {
    file: string;
    min?: number;
    max?: number;
    tries?: number;
    invalidFile?: string;
    timeout?: number;
    terminators?: string;
    varName?: string;
    regexp?: string;
    digitTimeout?: number;
  }

  export interface RecordOptions {
    timeLimitSecs?: number;
    silenceThresh?: number;
    silenceHits?: number;
  }

  export interface ConfJoinOptions {
    pin?: string;
    profile?: string;
    flags?: {
      mute?: boolean;
      deaf?: boolean;
      muteDetect?: boolean;
      distDtmf?: boolean;
      moderator?: boolean;
      nomoh?: boolean;
      endconf?: boolean;
      mintwo?: boolean;
      ghost?: boolean;
      joinOnly?: boolean;
      positional?: boolean;
      noPositional?: boolean;
      joinVidFloor?: boolean;
      noMinimizeEncoding?: boolean;
      vmute?: boolean;
      secondScreen?: boolean;
      waitMod?: boolean;
      audioAlways?: boolean;
      videoBridgeFirstTwo?: boolean;
      videoMuxingPersonalCanvas?: boolean;
      videoRequiredForCanvas?: boolean;
      [key: string]: boolean | undefined;
    };
  }

  export type OperationCallback = (err: Error | null, ...results: any[]) => void;
  export interface PlaybackResults {
    seconds?: number;
    milliseconds?: number;
    samples?: number;
    remainingFiles?: string[];
    playbackSeconds?: string;
    playbackMilliseconds?: string;
    digits?: string;
    invalidDigits?: string;
    terminatorUsed?: string;
    playbackLastOffsetPos?: string;
    done?: (...args: any[]) => void;
  }
  export type PlayOperationCallback = (err: Error | null, results?: PlaybackResults) => void;
}

namespace Endpoint {
  export interface Events {

    'ready': () => void;
    'dtmf': (args: { dtmf: string; duration: string; source: string; ssrc?: string; timestamp?: string }) => void;
    'tone': (args: { tone: string }) => void;
    'playback-start': (opts: any) => void;
    'playback-stop': (opts: any) => void;
    'channelCallState': (args: { state: string }) => void;
    'destroy': (args?: { reason?: string }) => void;

  }
}

declare interface Endpoint {
  on<U extends keyof Endpoint.Events>(event: U, listener: Endpoint.Events[U]): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  once<U extends keyof Endpoint.Events>(event: U, listener: Endpoint.Events[U]): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;

  off<U extends keyof Endpoint.Events>(event: U, listener: Endpoint.Events[U]): this;
  off(event: string | symbol, listener: (...args: any[]) => void): this;

  emit<U extends keyof Endpoint.Events>(event: U, ...args: Parameters<Endpoint.Events[U]>): boolean;
  emit(event: string | symbol, ...args: any[]): boolean;
}
namespace Endpoint {
  export interface Events {

    'ready': () => void;
    'dtmf': (args: { dtmf: string; duration: string; source: string; ssrc?: string; timestamp?: string }) => void;
    'tone': (args: { tone: string }) => void;
    'playback-start': (opts: any) => void;
    'playback-stop': (opts: any) => void;
    'channelCallState': (args: { state: string }) => void;
    'destroy': (args?: { reason?: string }) => void;

  }
}

declare interface Endpoint {
  on<U extends keyof Endpoint.Events>(event: U, listener: Endpoint.Events[U]): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  once<U extends keyof Endpoint.Events>(event: U, listener: Endpoint.Events[U]): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;

  off<U extends keyof Endpoint.Events>(event: U, listener: Endpoint.Events[U]): this;
  off(event: string | symbol, listener: (...args: any[]) => void): this;

  emit<U extends keyof Endpoint.Events>(event: U, ...args: Parameters<Endpoint.Events[U]>): boolean;
  emit(event: string | symbol, ...args: any[]): boolean;
}
class Endpoint extends EventEmitter {
  private _customEvents: string[];
  private _conn: EslConnection | null;
  private _ms: MediaServer;
  private _dialog: SrfDialog | null;
  public uuid: string;
  public secure: boolean;
  public local: { sdp?: string; mediaIp?: string; mediaPort?: string };
  public remote: { sdp?: string; mediaIp?: string; mediaPort?: string };
  public sip: { callId?: string };
  public conf: { memberId?: number; name?: string; uuid?: string };
  public state: State;
  private _muted: boolean;
  private _ready: boolean = false;
  private _joinCallback?: (memberId: number, confUuid: string) => void;
  public dtmfType?: string;

  constructor(conn: EslConnection, dialog: SrfDialog, ms: MediaServer, opts?: Endpoint.CreateOptions) {
    super();

    opts = opts || {};
    this._customEvents = (opts.customEvents = opts.customEvents || []).map((ev) => `CUSTOM ${ev}`);
    assert(Array.isArray(this._customEvents));

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
        if (typeof opts.codecs === 'string') opts.codecs = [opts.codecs];
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

  get mediaserver(): MediaServer {
    return this._ms;
  }

  get ms(): MediaServer {
    return this._ms;
  }

  get srf(): Srf {
    return this.ms.srf;
  }

  get conn(): EslConnection {
    return this._conn as EslConnection;
  }

  get dialog(): SrfDialog {
    return this._dialog as SrfDialog;
  }

  set dialog(dlg: any) {
    this._dialog = dlg;
  }

  get connected(): boolean {
    return this.state === State.CONNECTED;
  }

  get muted(): boolean {
    return this._muted;
  }

  filter(header: string, value: string) {
    if (this._conn) this._conn.filter(header, value);
  }

  request(opts: any) {
    if (this._dialog) return this._dialog.request(opts);
  }

  private _setOrExport(which: 'set' | 'export', param: string | object, value?: string, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    const obj: Record<string, any> = {};
    if (typeof param === 'string') obj[param] = value;
    else Object.assign(obj, param);

    const __x = async (cb: Endpoint.OperationCallback) => {
      const p = [];
      if (which === 'set' && Object.keys(obj).length > 1) {
        const hasSpecialChar = (str: any) => {
          if (typeof str !== 'string') return false;
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
      } else {
        for (const [k, val] of Object.entries(obj)) {
          p.push(this.execute(which, `${k}=${val}`));
        }
      }
      await Promise.all(p);
      cb(null);
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }
    return new Promise((resolve, reject) => {
      __x((err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
  }

  set(param: string | object): Promise<EslEvent>;
  set(param: string | object, value: string): Promise<EslEvent>;
  set(param: string | object, callback: Endpoint.OperationCallback): this;
  set(param: string | object, value: string, callback: Endpoint.OperationCallback): this;
  set(param: string | object, value?: string | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    if (typeof param === 'object' && typeof value === 'function') {
      callback = value;
      value = undefined;
    }
    return this._setOrExport('set', param, value as string, callback as any) as any;
  }

  export(param: string | object): Promise<EslEvent>;
  export(param: string | object, value: string): Promise<EslEvent>;
  export(param: string | object, callback: Endpoint.OperationCallback): this;
  export(param: string | object, value: string, callback: Endpoint.OperationCallback): this;
  export(param: string | object, value?: string | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    if (typeof param === 'object' && typeof value === 'function') {
      callback = value;
      value = undefined;
    }
    return this._setOrExport('export', param, value as string, callback as any) as any;
  }

  resetEslCustomEvent() {
    this.conn.removeAllListeners('esl::event::CUSTOM::*');
    this.conn.on(`esl::event::CUSTOM::${this.uuid}`, this._onCustomEvent.bind(this));
  }

  addCustomEventListener(event: string, handler: (...args: any[]) => void) {
    assert.ok(typeof event === 'string', 'event name must be string type');
    assert.ok(typeof handler === 'function', 'handler must be a function type');
    assert.ok(event.indexOf('CUSTOM ') !== 0, "event name should not include 'CUSTOM ' prefix");

    const fullEventName = `CUSTOM ${event}`;
    if (-1 === this._customEvents.indexOf(fullEventName)) {
      this._customEvents.push(fullEventName);
      this.conn.subscribe(fullEventName);
    }
    this.removeListener(event, handler);
    this.on(event, handler);
  }

  removeCustomEventListener(event: string, handler?: (...args: any[]) => void) {
    let del = false;
    if (handler) {
      this.removeListener(event, handler);
      del = this.listenerCount(event) === 0;
    } else {
      this.removeAllListeners(event);
      del = true;
    }
    const fullEventName = `CUSTOM ${event}`;
    const idx = this._customEvents.indexOf(fullEventName);
    if (-1 !== idx && del) this._customEvents.splice(idx, 1);
  }

  getChannelVariables(): Promise<Record<string, string>>;
  getChannelVariables(includeMedia: boolean): Promise<Record<string, string>>;
  getChannelVariables(callback: Endpoint.OperationCallback): this;
  getChannelVariables(includeMedia: boolean, callback: Endpoint.OperationCallback): this;
  getChannelVariables(includeMedia?: boolean | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<Record<string, string>> | this {
    if (typeof includeMedia === 'function') {
      callback = includeMedia;
      includeMedia = false;
    }

    const __x = async (cb: Endpoint.OperationCallback) => {
      try {
        if (includeMedia === true) await this.api('uuid_set_media_stats', this.uuid);
        const { headers, body } = await (this.api('uuid_dump', this.uuid) as any);
        const hdrs: Record<string, string> = {};
        headers.forEach((h: any) => (hdrs[h.name] = h.value));
        if (hdrs['Content-Type'] === 'api/response' && 'Content-Length' in hdrs) {
          const bodyLen = parseInt(hdrs['Content-Length'], 10);
          return cb(null, parseBodyText(body.slice(0, bodyLen)));
        }
        cb(null, {});
      } catch (err) {
        cb(err as Error);
      }
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, results) => {
        if (err) return reject(err);
        resolve(results as any);
      });
    });
  }

  private _onCustomEvent(evt: EslEvent) {
    const eventName = evt.getHeader('Event-Subclass');
    const fullEventName = `CUSTOM ${eventName}`;
    const ev = this._customEvents.find((e) => e === fullEventName);
    if (ev) {
      try {
        const args = JSON.parse(evt.getBody());
        debug(`Endpoint#__onCustomEvent: ${ev} - emitting JSON argument ${evt.getBody()}`);
        this.emit(eventName, args, evt);
      } catch (err) {
        if (err instanceof SyntaxError) {
          this.emit(eventName, evt.getBody(), evt);
          debug(`Endpoint#__onCustomEvent: ${ev} - emitting text argument ${evt.getBody()}`);
        } else {
          console.error(err, `Error emitting event ${eventName}`);
        }
      }
    }
  }

  play(file: string | string[] | Endpoint.PlaybackOptions): Promise<Endpoint.PlaybackResults>;
  play(file: string | string[] | Endpoint.PlaybackOptions, callback: Endpoint.PlayOperationCallback): this;
  play(file: string | string[] | Endpoint.PlaybackOptions, callback?: Endpoint.PlayOperationCallback): Promise<Endpoint.PlaybackResults> | this {
    assert.ok(typeof file === 'string' || typeof file === 'object' || Array.isArray(file), 'file param is required');

    let timeoutSecs = -1;
    if (typeof file === 'object' && !Array.isArray(file)) {
      const fOpts = file as Endpoint.PlaybackOptions;
      assert.ok(typeof fOpts.file === 'string', 'file is required for PlaybackOptions object');
      if (fOpts.seekOffset && fOpts.seekOffset > 0) fOpts.file = `${fOpts.file}@@${fOpts.seekOffset}`;
      if (fOpts.timeoutSecs) timeoutSecs = fOpts.timeoutSecs;
      file = fOpts.file;
    }
    const files = Array.isArray(file) ? file : [file];

    const __x = async (cb: Endpoint.PlayOperationCallback) => {
      try {
        if (files.length !== 1) await this.execute('set', 'playback_delimiter=!');
        if (timeoutSecs > 0) await this.execute('set', `playback_timeout_sec=${timeoutSecs}`);
        const evt = await (this.execute('playback', files.join('!')) as any);
        if (evt.getHeader('Application-Response') === 'FILE NOT FOUND') {
          throw new Error('File Not Found');
        } else {
          cb(null, {
            playbackSeconds: evt.getHeader('variable_playback_seconds'),
            playbackMilliseconds: evt.getHeader('variable_playback_ms'),
            playbackLastOffsetPos: evt.getHeader('variable_playback_last_offset_pos')
          });
        }
      } catch (err) {
        cb(err as Error);
      }
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  playCollect(opts: Endpoint.PlayCollectOptions): Promise<Endpoint.PlaybackResults>;
  playCollect(opts: Endpoint.PlayCollectOptions, callback: Endpoint.PlayOperationCallback): this;
  playCollect(opts: Endpoint.PlayCollectOptions, callback?: Endpoint.PlayOperationCallback): Promise<Endpoint.PlaybackResults> | this {
    assert.strictEqual(typeof opts, 'object', "'opts' param is required");
    assert.strictEqual(typeof opts.file, 'string', "'opts.file' param is required");

    const __x = (cb: Endpoint.PlayOperationCallback) => {
      opts.min = opts.min || 0;
      opts.max = opts.max || 128;
      opts.tries = opts.tries || 1;
      opts.timeout = opts.timeout || 120000;
      opts.terminators = opts.terminators || '#';
      opts.invalidFile = opts.invalidFile || 'silence_stream://250';
      opts.varName = opts.varName || 'myDigitBuffer';
      opts.regexp = opts.regexp || '\\d+';
      opts.digitTimeout = opts.digitTimeout || 8000;

      const args = ['min', 'max', 'tries', 'timeout', 'terminators', 'file', 'invalidFile', 'varName', 'regexp', 'digitTimeout'].map((prop) => opts[prop as keyof Endpoint.PlayCollectOptions]);

      this.execute('play_and_get_digits', args.join(' '), (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
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

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  say(text: string, opts: any): Promise<Endpoint.PlaybackResults>;
  say(text: string, opts: any, callback: Endpoint.PlayOperationCallback): this;
  say(text: string, opts: any, callback?: Endpoint.PlayOperationCallback): Promise<Endpoint.PlaybackResults> | this {
    assert.strictEqual(typeof text, 'string', "'text' is required");
    assert.strictEqual(typeof opts, 'object', "'opts' param is required");
    assert.strictEqual(typeof opts.sayType, 'string', "'opts.sayType' param is required");
    assert.strictEqual(typeof opts.sayMethod, 'string', "'opts.sayMethod' param is required");

    opts.lang = opts.lang || 'en';
    opts.sayType = opts.sayType.toUpperCase();
    opts.sayMethod = opts.sayMethod.toLowerCase();

    const args: string[] = [];
    ['lang', 'sayType', 'sayMethod', 'gender'].forEach((prop) => {
      if (opts[prop]) {
        args.push(opts[prop]);
      }
    });
    args.push(text);

    const __x = (cb: Endpoint.PlayOperationCallback) => {
      this.execute('say', args.join(' '), (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const application = evt.getHeader('Application');
        if ('say' !== application) return cb(new Error(`Unexpected application: ${application}`));
        cb(null, {
          playbackSeconds: evt.getHeader('variable_playback_seconds'),
          playbackMilliseconds: evt.getHeader('variable_playback_ms')
        });
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  speak(opts: any): Promise<Endpoint.PlaybackResults>;
  speak(opts: any, callback: Endpoint.OperationCallback): this;
  speak(opts: any, callback?: Endpoint.OperationCallback): Promise<Endpoint.PlaybackResults> | this {
    assert.strictEqual(typeof opts, 'object', "'opts' param is required");
    assert.strictEqual(typeof opts.ttsEngine, 'string', "'opts.ttsEngine' param is required");
    assert.strictEqual(typeof opts.voice, 'string', "'opts.voice' param is required");
    assert.strictEqual(typeof opts.text, 'string', "'opts.text' param is required");

    const __x = (cb: Endpoint.OperationCallback) => {
      const args = [opts.ttsEngine, opts.voice, opts.text].join('|');
      this.execute('speak', args, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const application = evt.getHeader('Application');
        if ('speak' !== application) return cb(new Error(`Unexpected application: ${application}`));
        cb(null);
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  join(conf: string | Conference): Promise<{ confUuid: string }>;
  join(conf: string | Conference, opts: Endpoint.ConfJoinOptions): Promise<{ confUuid: string }>;
  join(conf: string | Conference, callback: Endpoint.OperationCallback): this;
  join(conf: string | Conference, opts: Endpoint.ConfJoinOptions, callback: Endpoint.OperationCallback): this;
  join(conf: string | Conference, opts?: Endpoint.ConfJoinOptions | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<{ confUuid: string }> | this {
    const confName = typeof conf === 'string' ? conf : conf.name;
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = opts || {};
    opts.flags = opts.flags || {};

    const flags: string[] = [];
    for (const [key, value] of Object.entries(opts.flags)) {
      if (true === value) flags.push(snakeCase(key).replace(/_/g, '-'));
    }

    let args = confName;
    if (opts.profile) args += '@' + opts.profile;
    if (!!opts.pin || flags.length > 0) args += '+';
    if (opts.pin) args += opts.pin;
    if (flags.length > 0) args += '+flags{' + flags.join('|') + '}';

    const __x = (cb: Endpoint.OperationCallback) => {
      const listener = this.__onConferenceEvent.bind(this);
      debug(`Endpoint#join: ${this.uuid} executing conference with args: ${args}`);

      this.conn.on('esl::event::CUSTOM::*', listener);

      this.execute('conference', args);

      assert(!this._joinCallback);

      this._joinCallback = (memberId: number, confUuid: string) => {
        debug(`Endpoint#joinConference: ${this.uuid} joined ${confName}:${confUuid} with memberId ${memberId}`);
        this._joinCallback = undefined;
        this.conf.memberId = memberId;
        this.conf.name = confName;
        this.conf.uuid = confUuid;

        this.conn.removeListener('esl::event::CUSTOM::*', listener);

        cb(null, { memberId, confUuid });
      };
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  bridge(other: string | Endpoint): Promise<EslEvent>;
  bridge(other: string | Endpoint, callback: Endpoint.OperationCallback): this;
  bridge(other: string | Endpoint, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    const otherUuid = typeof other === 'string' ? other : other.uuid;

    const __x = (cb: Endpoint.OperationCallback) => {
      this.api('uuid_bridge', [this.uuid, otherUuid], (err: Error | null, event: any, headers: any, body: any) => {
        if (err) return cb(err);
        if (body && 0 === body.indexOf('+OK')) {
          return cb(null);
        }
        cb(new Error(body));
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  unbridge(): Promise<EslEvent>;
  unbridge(callback: Endpoint.OperationCallback): this;
  unbridge(callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    const __x = (cb: Endpoint.OperationCallback) => {
      this.api('uuid_transfer', [this.uuid, '-both', 'park', 'inline'], (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const body = evt.getBody();
        if (0 === body.indexOf('+OK')) {
          return cb(null);
        }
        cb(new Error(body));
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  getNonMatchingConfParticipants(confName: string, tag: string): Promise<EslEvent>;
  getNonMatchingConfParticipants(confName: string, tag: string, callback: Endpoint.OperationCallback): this;
  getNonMatchingConfParticipants(confName: string, tag: string, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    const __x = (cb: Endpoint.OperationCallback) => {
      const args = [confName, 'gettag', tag, 'nomatch'];
      this.api('conference', args, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const body = evt.getBody().trim()
          .split(',')
          .map((v: string) => parseInt(v, 10))
          .filter((v: number) => !isNaN(v));
        cb(null, body);
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }
    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  setGain(opts: any): Promise<EslEvent>;
  setGain(opts: any, callback: Endpoint.OperationCallback): this;
  setGain(opts: any, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    const __x = (cb: Endpoint.OperationCallback) => {
      const db = parseDecibels(opts);
      const args = [this.uuid, 'setGain', db.toString()];
      this.api('uuid_dub', args, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const body = evt.getBody();
        if (0 === body.indexOf('+OK')) {
          return cb(null);
        }
        cb(new Error(body));
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }
    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  dub(opts: any): Promise<EslEvent>;
  dub(opts: any, callback: Endpoint.OperationCallback): this;
  dub(opts: any, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    const { action, track, play, say, loop, gain } = opts;
    assert.ok(action, 'ep#dub: action is required');
    assert.ok(track, 'ep#dub: track is required');

    const __x = (cb: Endpoint.OperationCallback) => {
      const args: any[] = [this.uuid, action, track];
      if (action === 'playOnTrack') {
        args.push(play);
        args.push(loop ? 'loop' : 'once');
        if (gain) args.push(gain);
      } else if (action === 'sayOnTrack') {
        args.push(say);
        args.push(loop ? 'loop' : 'once');
        if (gain) args.push(gain);
      }

      this.api('uuid_dub', `^^|${args.join('|')}`, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const body = evt.getBody();
        if (0 === body.indexOf('+OK')) {
          return cb(null);
        }
        cb(new Error(body));
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  startTranscription(opts: any): Promise<EslEvent>;
  startTranscription(opts: any, callback: Endpoint.OperationCallback): this;
  startTranscription(opts: any, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    opts = opts || {};
    let apiCall: string, bugname: string;
    if (opts.vendor.startsWith('custom:')) {
      apiCall = 'uuid_jambonz_transcribe';
      bugname = `${opts.vendor}_transcribe`;
    } else {
      let vendor = opts.vendor;
      if (vendor === 'microsoft') vendor = 'azure';
      if (vendor === 'polly') vendor = 'aws';
      apiCall = `uuid_${vendor}_transcribe`;
      bugname = `${vendor}_transcribe`;
    }

    const type = opts.interim === true ? 'interim' : 'final';
    const channels = opts.channels === 2 ? 'stereo' : 'mono';
    const __x = (cb: Endpoint.OperationCallback) => {
      const args: any[] = opts.hostport ?
        [this.uuid, 'start', opts.hostport, opts.locale || 'en-US', type, channels, opts.bugname || bugname] :
        [this.uuid, 'start', opts.locale || 'en-US', type, channels, opts.bugname || bugname];

      if (opts.prompt) {
        const a = args.concat(opts.prompt);
        this.api(apiCall, `^^|${a.join('|')}`, (err: Error | null, evt: EslEvent) => {
          if (err) return cb(err);
          const body = evt.getBody();
          if (0 === body.indexOf('+OK')) return cb(null);
          cb(new Error(body));
        });
      } else {
        this.api(apiCall, args, (err: Error | null, evt: EslEvent) => {
          if (err) return cb(err);
          const body = evt.getBody();
          if (0 === body.indexOf('+OK')) return cb(null);
          cb(new Error(body));
        });
      }
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  startTranscriptionTimers(opts: any): Promise<EslEvent>;
  startTranscriptionTimers(opts: any, callback: Endpoint.OperationCallback): this;
  startTranscriptionTimers(opts: any, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
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
    const __x = (cb: Endpoint.OperationCallback) => {
      this.api(apiCall, [this.uuid, 'start_timers', opts.bugname || bugname], (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const body = evt.getBody();
        if (0 === body.indexOf('+OK')) return cb(null);
        cb(new Error(body));
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  stopTranscription(opts: any): Promise<EslEvent>;
  stopTranscription(opts: any, callback: Endpoint.OperationCallback): this;
  stopTranscription(opts: any, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    if (typeof opts === 'function') {
      callback = opts;
      opts = { vendor: 'google' };
    }
    let apiCall: string, bugname: string;
    if (opts.vendor.startsWith('custom:')) {
      apiCall = 'uuid_jambonz_transcribe';
      bugname = `${opts.vendor}_transcribe`;
    } else {
      let vendor = opts.vendor;
      if (vendor === 'microsoft') vendor = 'azure';
      if (vendor === 'polly') vendor = 'aws';
      apiCall = `uuid_${vendor}_transcribe`;
      bugname = `${vendor}_transcribe`;
    }

    const __x = (cb: Endpoint.OperationCallback) => {
      const args = [this.uuid, 'stop', opts.bugname || bugname];
      this.api(apiCall, args, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const body = evt.getBody();
        if (0 === body.indexOf('+OK')) return cb(null);
        cb(new Error(body));
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  startVadDetection(opts: any): Promise<EslEvent>;
  startVadDetection(opts: any, callback: Endpoint.OperationCallback): this;
  startVadDetection(opts: any, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
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

    const __x = (cb: Endpoint.OperationCallback) => {
      const args = vendor === 'native' ?
        [this.uuid, 'start', strategy, mode, silenceMs, voiceMs, bugname] :
        [this.uuid, 'start', strategy, threshold, silenceMs, voiceMs, speechPadMs, bugname];
      this.api(apiCall, args, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const body = evt.getBody();
        if (0 === body.indexOf('+OK')) return cb(null);
        cb(new Error(body));
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  stopVadDetection(opts: any): Promise<EslEvent>;
  stopVadDetection(opts: any, callback: Endpoint.OperationCallback): this;
  stopVadDetection(opts: any, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    opts = opts || {};
    const vendor = opts.vendor || 'native';
    const apiCall = vendor === 'native' ? 'uuid_vad_detect' : 'uuid_vad_silero';
    const bugname = opts.bugname || (vendor === 'native' ? 'vad_detection' : 'vad_detection_silero');

    const __x = (cb: Endpoint.OperationCallback) => {
      const args = [this.uuid, 'stop', bugname];
      this.api(apiCall, args, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const body = evt.getBody();
        if (0 === body.indexOf('+OK')) return cb(null);
        cb(new Error(body));
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  forkAudioStart(opts: any): Promise<EslEvent>;
  forkAudioStart(opts: any, callback: Endpoint.OperationCallback): this;
  forkAudioStart(opts: any, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    assert.ok(typeof opts.wsUrl === 'string', 'opts.wsUrl is required');
    const sampling = opts.sampling || '8000';
    const mix = opts.mixType || 'mono';
    assert.ok(['mono', 'mixed', 'stereo'].includes(mix), "opts.mixType must be 'mono', 'mixed', 'stereo'");

    const __x = (cb: Endpoint.OperationCallback) => {
      const args: any[] = [this.uuid, 'start', opts.wsUrl, mix, sampling];
      args.push(opts.bugname || '');
      if (opts.metadata) {
        const text = typeof opts.metadata === 'string' ? `'${opts.metadata}'` : `'${JSON.stringify(opts.metadata)}'`;
        args.push(text);
      } else {
        args.push('');
      }
      args.push(opts.bidirectionalAudio ? opts.bidirectionalAudio.enabled || 'true' : 'true');
      args.push(opts.bidirectionalAudio ? opts.bidirectionalAudio.streaming || 'false' : 'false');
      args.push(opts.bidirectionalAudio ? opts.bidirectionalAudio.sampleRate || '' : '');
      this.api('uuid_audio_fork', `^^|${args.join('|')}`, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const body = evt.getBody();
        if (0 === body.indexOf('+OK')) return cb(null);
        cb(new Error(body));
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  forkAudioSendText(bugname: any): Promise<EslEvent>;
  forkAudioSendText(bugname: any, metadata: any): Promise<EslEvent>;
  forkAudioSendText(callback: Endpoint.OperationCallback): this;
  forkAudioSendText(bugname: any, callback: Endpoint.OperationCallback): this;
  forkAudioSendText(bugname: any, metadata: any, callback: Endpoint.OperationCallback): this;
  forkAudioSendText(bugname: any, metadata?: any, callback?: any): Promise<EslEvent> | this {
    const args: any[] = [this.uuid, 'send_text'];
    if (arguments.length === 1 && typeof bugname === 'function') {
      callback = bugname;
      bugname = null;
      metadata = null;
    } else if (arguments.length === 1) {
      if (typeof bugname === 'object' || bugname.startsWith('{') || bugname.startsWith('[')) {
        metadata = bugname;
        bugname = null;
      } else {
        metadata = null;
      }
    } else if (arguments.length === 2) {
      if (typeof metadata === 'function') {
        callback = metadata;
        if (typeof bugname === 'object' || bugname.startsWith('{') || bugname.startsWith('[')) {
          metadata = bugname;
          bugname = null;
        } else {
          metadata = null;
        }
      }
    }
    assert(callback === undefined || typeof callback === 'function', 'callback must be a function');

    if (metadata && typeof metadata === 'object') metadata = `'${JSON.stringify(metadata)}'`;
    else if (metadata) metadata = `'${metadata}'`;

    if (bugname) args.push(bugname);
    args.push(metadata);

    const __x = (cb: Endpoint.OperationCallback) => {
      this.api('uuid_audio_fork', args, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const body = evt.getBody();
        if (0 === body.indexOf('+OK')) return cb(null);
        cb(new Error(body));
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  forkAudioStop(): Promise<EslEvent>;
  forkAudioStop(bugname: any): Promise<EslEvent>;
  forkAudioStop(bugname: any, metadata: any): Promise<EslEvent>;
  forkAudioStop(callback: Endpoint.OperationCallback): this;
  forkAudioStop(bugname: any, callback: Endpoint.OperationCallback): this;
  forkAudioStop(bugname: any, metadata: any, callback: Endpoint.OperationCallback): this;
  forkAudioStop(bugname?: any, metadata?: any, callback?: any): Promise<EslEvent> | this {
    const args: any[] = [this.uuid, 'stop'];
    if (arguments.length === 1 && typeof bugname === 'function') {
      callback = bugname;
      bugname = null;
      metadata = null;
    } else if (arguments.length === 1) {
      if (typeof bugname === 'object' || bugname.startsWith('{') || bugname.startsWith('[')) {
        metadata = bugname;
        bugname = null;
      } else {
        metadata = null;
      }
    } else if (arguments.length === 2) {
      if (typeof metadata === 'function') {
        callback = metadata;
        if (typeof bugname === 'object' || bugname.startsWith('{') || bugname.startsWith('[')) {
          metadata = bugname;
          bugname = null;
        } else {
          metadata = null;
        }
      }
    }
    assert(callback === undefined || typeof callback === 'function', 'callback must be a function');

    if (metadata && typeof metadata === 'object') metadata = `'${JSON.stringify(metadata)}'`;
    else if (metadata) metadata = `'${metadata}'`;

    if (bugname) args.push(bugname);
    if (metadata) args.push(metadata);

    const __x = (cb: Endpoint.OperationCallback) => {
      debug(`calling uuid_audio_fork with args ${JSON.stringify(args)}`);
      this.api('uuid_audio_fork', args, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const body = evt.getBody();
        if (0 === body.indexOf('+OK')) return cb(null);
        cb(new Error(body));
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  forkAudioPause(): Promise<EslEvent>;
  forkAudioPause(bugname: any): Promise<EslEvent>;
  forkAudioPause(bugname: any, silence: any): Promise<EslEvent>;
  forkAudioPause(callback: Endpoint.OperationCallback): this;
  forkAudioPause(bugname: any, callback: Endpoint.OperationCallback): this;
  forkAudioPause(bugname: any, silence: any, callback: Endpoint.OperationCallback): this;
  forkAudioPause(bugname?: any, silence?: any, callback?: any): Promise<EslEvent> | this {
    const args: any[] = [this.uuid, 'pause'];

    if (arguments.length === 1) {
      if (typeof bugname === 'function') {
        callback = bugname;
        bugname = null;
        silence = false;
      } else if (typeof bugname === 'boolean') {
        silence = bugname;
        bugname = null;
      } else {
        silence = false;
      }
    } else if (arguments.length === 2) {
      if (typeof silence === 'function') {
        callback = silence;
        if (typeof bugname === 'boolean') {
          silence = bugname;
          bugname = null;
        } else {
          silence = false;
        }
      }
    }
    if (bugname) {
      args.push(bugname);
      args.push(silence ? 'silence' : 'blank');
    }

    const __x = (cb: Endpoint.OperationCallback) => {
      debug(`calling uuid_audio_fork with args ${JSON.stringify(args)}`);
      this.api('uuid_audio_fork', args, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const body = evt.getBody();
        if (0 === body.indexOf('+OK')) return cb(null);
        cb(new Error(body));
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  forkAudioResume(): Promise<EslEvent>;
  forkAudioResume(bugname: any): Promise<EslEvent>;
  forkAudioResume(callback: Endpoint.OperationCallback): this;
  forkAudioResume(bugname: any, callback: Endpoint.OperationCallback): this;
  forkAudioResume(bugname?: any, callback?: any): Promise<EslEvent> | this {
    const args: any[] = [this.uuid, 'resume'];
    if (arguments.length === 1) {
      if (typeof bugname === 'function') {
        callback = bugname;
        bugname = null;
      }
    }
    if (bugname) args.push(bugname);

    const __x = (cb: Endpoint.OperationCallback) => {
      debug(`calling uuid_audio_fork with args ${JSON.stringify(args)}`);
      this.api('uuid_audio_fork', args, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const body = evt.getBody();
        if (0 === body.indexOf('+OK')) return cb(null);
        cb(new Error(body));
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  mute(): Promise<EslEvent>;
  mute(callback: Endpoint.OperationCallback): this;
  mute(callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    this._muted = true;
    return this.execute('set_mute', 'read true', callback as any) as any;
  }

  unmute(): Promise<EslEvent>;
  unmute(callback: Endpoint.OperationCallback): this;
  unmute(callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    this._muted = false;
    return this.execute('set_mute', 'read false', callback as any) as any;
  }

  toggleMute(): Promise<EslEvent>;
  toggleMute(callback: Endpoint.OperationCallback): this;
  toggleMute(callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    this._muted = !this._muted;
    return this.execute('set_mute', `read ${this._muted ? 'true' : 'false'}`, callback as any) as any;
  }

  api(command: string): Promise<EslEvent>;
  api(command: string, args: string | string[]): Promise<EslEvent>;
  api(command: string, callback: Endpoint.OperationCallback): this;
  api(command: string, args: string | string[], callback: Endpoint.OperationCallback): this;
  api(command: string, args?: string | string[] | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    if (typeof args === 'function') {
      callback = args;
      args = [];
    }

    const __x = (cb: Endpoint.OperationCallback) => {
      if (!this._conn) return cb(new Error('endpoint no longer active'));
      debug(`Endpoint#api ${command} ${args || ''}`);
      this._conn.api(command, args || "", (...response: any[]) => {
        debug(`Endpoint#api response: ${JSON.stringify(response).slice(0, 512)}`);
        cb(null, ...response);
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, response) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  execute(app: string): Promise<EslEvent>;
  execute(app: string, arg: string): Promise<EslEvent>;
  execute(app: string, callback: Endpoint.OperationCallback): this;
  execute(app: string, arg: string, callback: Endpoint.OperationCallback): this;
  execute(app: string, arg?: string | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    if (typeof arg === 'function') {
      callback = arg;
      arg = '';
    }

    const __x = (cb: Endpoint.OperationCallback) => {
      if (!this._conn) return cb(new Error('endpoint no longer active'));
      debug(`Endpoint#execute ${app} ${arg}`);
      this._conn.execute(app, arg, (evt: EslEvent) => {
        cb(null, evt);
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, response) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  executeAsync(app: string, arg: string, callback?: any) {
    return this._conn?.execute(app, arg, callback as any);
  }

  modify(newSdp: string) {
    let result: any;
    return this._dialog?.modify(newSdp)
      .then((res: any) => {
        result = res;
        return this.getChannelVariables(true) as Promise<Record<string, string>>;
      })
      .then((obj: any) => {
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

  destroy(): Promise<void>;
  destroy(callback: Endpoint.OperationCallback): this;
  destroy(): Promise<void>;
  destroy(callback: Endpoint.OperationCallback): this;
  destroy(callback?: Endpoint.OperationCallback): Promise<void> | this {
    const __x = (cb: Endpoint.OperationCallback) => {
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
      this.execute('hangup', (err: Error | null) => {
        if (err) {
          debug(`got error hanging up endpoint ${this.uuid}: ${err.message}`);
          cb(err);
        }
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  recordSession(...args: any[]): Promise<EslEvent>;
  recordSession(...args: any[]): Promise<EslEvent> | this {
    return this._endpointApps('record_session', ...args);
  }

  private _endpointApps(app: string, ...args: any[]): Promise<EslEvent>;
  private _endpointApps(app: string, ...args: any[]): Promise<EslEvent> | this {
    const len = args.length;
    let argList = args;
    let callback: any = null;

    if (len > 0 && typeof args[len - 1] === 'function') {
      argList = args.slice(0, len - 1);
      callback = args[len - 1];
    }
    const __x = (cb: Endpoint.OperationCallback) => {
      this.execute(app, argList.join(' '), cb);
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  record(file: string): Promise<EslEvent>;
  record(file: string, opts: Endpoint.RecordOptions): Promise<EslEvent>;
  record(file: string, callback: Endpoint.OperationCallback): this;
  record(file: string, opts: Endpoint.RecordOptions, callback: Endpoint.OperationCallback): this;
  record(file: string, opts?: Endpoint.RecordOptions | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = opts || {};

    const args: string[] = [];
    ['timeLimitSecs', 'silenceThresh', 'silenceHits'].forEach((p) => {
      const val = (opts as any)[p];
      if (val !== undefined) {
        args.push(val.toString());
      }
    });

    const __x = (cb: Endpoint.OperationCallback) => {
      this.execute('record', `${file} ${args.join(' ')}`, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err, evt);
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

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  // conference member operations
  private _confOp(op: string): Promise<EslEvent>;
  private _confOp(op: string, args: string | string[]): Promise<EslEvent>;
  private _confOp(op: string, callback: Endpoint.OperationCallback): this;
  private _confOp(op: string, args: string | string[], callback: Endpoint.OperationCallback): this;
  private _confOp(op: string, args?: string | string[] | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    if (typeof args === 'function') {
      callback = args;
      args = '';
    }
    args = args || '';
    if (Array.isArray(args)) args = args.join(' ');

    const __x = (cb: Endpoint.OperationCallback) => {
      if (!this.conf.memberId) return cb(new Error('Endpoint not in conference'));
      this.api('conference', `${this.conf.name} ${op} ${this.conf.memberId} ${args}`, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err, evt);
        const body = evt.getBody();
        if (-1 !== ['mute', 'deaf', 'unmute', 'undeaf', 'kick', 'tmute', 'vmute', 'unvmute', 'vmute-snap', 'dtmf'].indexOf(op)) {
          if (/OK\s+/.test(body)) return cb(err, body);
          return cb(new Error(body));
        }
        return cb(err, evt);
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  confMute(args?: any, callback?: Endpoint.OperationCallback) { return this._confOp('mute', args, callback as any); }
  confUnmute(args?: any, callback?: Endpoint.OperationCallback) { return this._confOp('unmute', args, callback as any); }
  confDeaf(args?: any, callback?: Endpoint.OperationCallback) { return this._confOp('deaf', args, callback as any); }
  confUndeaf(args?: any, callback?: Endpoint.OperationCallback) { return this._confOp('undeaf', args, callback as any); }
  confKick(args?: any, callback?: Endpoint.OperationCallback) { return this._confOp('kick', args, callback as any); }
  confHup(args?: any, callback?: Endpoint.OperationCallback) { return this._confOp('hup', args, callback as any); }
  unjoin(args?: any, callback?: Endpoint.OperationCallback) { return this.confKick(args, callback as any); }
  confTmute(args?: any, callback?: Endpoint.OperationCallback) { return this._confOp('tmute', args, callback as any); }
  confVmute(args?: any, callback?: Endpoint.OperationCallback) { return this._confOp('vmute', args, callback as any); }
  confUnvmute(args?: any, callback?: Endpoint.OperationCallback) { return this._confOp('unvmute', args, callback as any); }
  confVmuteSnap(args?: any, callback?: Endpoint.OperationCallback) { return this._confOp('vmute-snap', args, callback as any); }
  confSaymember(args?: any, callback?: Endpoint.OperationCallback) { return this._confOp('saymember', args, callback as any); }
  confDtmf(args?: any, callback?: Endpoint.OperationCallback) { return this._confOp('dtmf', args, callback as any); }

  confPlay(file: string): Promise<EslEvent>;
  confPlay(file: string, opts: any): Promise<EslEvent>;
  confPlay(file: string, callback: Endpoint.OperationCallback): this;
  confPlay(file: string, opts: any, callback: Endpoint.OperationCallback): this;
  confPlay(file: string, opts?: any | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    debug(`Endpoint#confPlay endpoint ${this.uuid} memberId ${this.conf.memberId}`);
    assert.ok(typeof file === 'string', "'file' is required and must be a file to play");

    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = opts || {};

    const __x = (cb: Endpoint.OperationCallback) => {
      if (!this.conf.memberId) return cb(new Error('Endpoint not in conference'));

      const args = [];
      if (opts.vol) args.push('vol=' + opts.volume);
      if (opts.fullScreen) args.push('full-screen=' + opts.fullScreen);
      if (opts.pngMs) args.push('png_ms=' + opts.pngMs);
      const s1 = args.length ? args.join(',') + ' ' : '';
      const cmdArgs = `${this.conf.name} play ${file} ${s1} ${this.conf.memberId}`;

      this.api('conference', cmdArgs, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const body = evt.getBody();
        if (/Playing file.*to member/.test(body)) return cb(null, evt);
        cb(new Error(body));
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, results) => {
        if (err) return reject(err);
        resolve(results as any);
      });
    });
  }

  transfer(newConf: string | Conference): Promise<EslEvent>;
  transfer(newConf: string | Conference, callback: Endpoint.OperationCallback): this;
  transfer(newConf: string | Conference, callback?: Endpoint.OperationCallback): Promise<EslEvent> | this {
    const confName = newConf instanceof Conference ? newConf.name : newConf;
    assert.ok(typeof confName === 'string', "'newConf' is required");

    const __x = (cb: Endpoint.OperationCallback) => {
      if (!this.conf.memberId) return cb(new Error('Endpoint not in conference'));

      this.api('conference', `${this.conf.name} transfer ${confName} ${this.conf.memberId}`, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err, evt);
        const body = evt.getBody();
        if (/OK Member.*sent to conference/.test(body)) return cb(null, body);
        cb(new Error(body));
      });
    };

    if (callback as any) {
      __x(callback as any);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result as any);
      });
    });
  }

  private __onConferenceEvent(evt: EslEvent) {
    const subclass = evt.getHeader('Event-Subclass');

    if (subclass === 'conference::maintenance') {
      const action = evt.getHeader('Action');
      debug(`Endpoint#__onConferenceEvent: conference event action: ${action}`);

      if (action === 'add-member') {
        this._onAddMember(evt);
      } else {
        this._unhandled(evt);
      }
    } else {
      debug(`Endpoint#__onConferenceEvent: got unhandled custom event: ${subclass}`);
    }
  }

  private _onAddMember(evt: EslEvent) {
    let memberId = -1;
    const confUuid = evt.getHeader('Conference-Unique-ID');
    try {
      memberId = parseInt(evt.getHeader('Member-ID'), 10);
    } catch {
      debug(`Endpoint#_onAddMember: error parsing memberId as an int: ${memberId}`);
    }
    debug(`Endpoint#_onAddMember: memberId ${memberId} conference uuid ${confUuid}`);
    if (this._joinCallback) {
      this._joinCallback(memberId, confUuid);
    }
  }

  private _unhandled(evt: EslEvent) {
    debug(`unhandled Conference event for endpoint ${this.uuid} with action: ${evt.getHeader('Action')}`);
  }

  private _onError(err: Error | null) {
    if ((err as any).errno && ((err as any).errno === 'ECONNRESET' || (err as any).errno === 'EPIPE') && this.state === State.DISCONNECTED) {
      debug('ignoring connection reset error during teardown of connection');
      return;
    }
    console.error(`Endpoint#_onError: uuid: ${this.uuid}: ${err}`);
  }

  private _onChannelCallState(evt: EslEvent) {
    const channelCallState = evt.getHeader('Channel-Call-State');

    debug(`Endpoint#_onChannelCallState ${this.uuid}: Channel-Call-State: ${channelCallState}`);
    if (State.NOT_CONNECTED === this.state && 'EARLY' === channelCallState) {
      this.state = State.EARLY;

      if (this.secure) {
        this.getChannelVariables(true, (err: Error | null, obj: any) => {
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

  private _onDtmf(evt: EslEvent) {
    if ('DTMF' === evt.getHeader('Event-Name')) {
      const args: any = {
        dtmf: evt.getHeader('DTMF-Digit'),
        duration: evt.getHeader('DTMF-Duration'),
        source: evt.getHeader('DTMF-Source')
      };
      if (evt.getHeader('DTMF-SSRC')) args.ssrc = evt.getHeader('DTMF-SSRC');
      if (evt.getHeader('DTMF-Timestamp')) args.timestamp = evt.getHeader('DTMF-Timestamp');
      this.emit('dtmf', args);
    }
  }

  private _onToneDetect(evt: EslEvent) {
    let tone = evt.getHeader('Detected-Tone');
    if (!tone && evt.getHeader('Detected-Fax-Tone') === 'true') tone = 'fax';
    this.emit('tone', { tone });
  }

  private _onPlaybackStart(evt: EslEvent) {
    if (evt.getHeader('Playback-File-Type') === 'tts_stream') {
      let header;
      const opts: any = {};
      evt.firstHeader();
      do {
        header = evt.nextHeader();
        if (header && header.startsWith('variable_tts_')) opts[header] = evt.getHeader(header);
      } while (header);
      this.emit('playback-start', opts);
    } else {
      this.emit('playback-start', { file: evt.getHeader('Playback-File-Path') });
    }
  }

  private _onPlaybackStop(evt: EslEvent) {
    if (evt.getHeader('Playback-File-Type') === 'tts_stream') {
      let header;
      const opts: any = {};
      evt.firstHeader();
      do {
        header = evt.nextHeader();
        if (header && header.startsWith('variable_tts_')) opts[header] = evt.getHeader(header);
      } while (header);
      this.emit('playback-stop', opts);
    } else {
      this.emit('playback-stop', { file: evt.getHeader('Playback-File-Path') });
    }
  }

  private _emitReady() {
    if (!this._ready) {
      this._ready = true;
      setImmediate(() => {
        this.emit('ready');
      });
    }
  }

  private _onHangup(evt: EslEvent) {
    // left intentionally empty matching original implementation
  }

  private _onBye(evt: EslEvent) {
    debug('Endpoint#_onBye: got BYE from media server');
    this.emit('destroy');
  }

  toJSON() {
    return pick(this, 'sip local remote uuid');
  }

  toString(): string {
    return JSON.stringify(this.toJSON());
  }
}

export = Endpoint;