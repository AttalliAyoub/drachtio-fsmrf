import { EslConnection, EslEvent, EslServer, Srf, SrfDialog, SrfRequest, SrfResponse } from "./types";
import { EventEmitter } from 'events';
import assert from 'assert';
import { pick } from './utils';
import createDebug from 'debug';
import Endpoint from './endpoint';
import MediaServer from './mediaserver';

const debug = createDebug('drachtio:fsmrf');

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

enum State {
  NOT_CREATED = 1,
  CREATED = 2,
  DESTROYED = 3
}

function unhandled(evt: EslEvent) {
  debug(`unhandled conference event: ${evt.getHeader('Action')}`);
}

namespace Conference {
  export interface CreateOptions {
    maxMembers?: number;
  }

  export type OperationCallback = (err: Error | null, response?: string | number) => void;
  export type PlaybackResults = {
    seconds: number;
    milliseconds: number;
    samples: number;
  };
  export type PlaybackCallback = (err: Error | null, results?: PlaybackResults) => void;
}

namespace Conference {
  export interface Events {

    'addMember': (evt: EslEvent) => void;
    'delMember': (evt: EslEvent) => void;
    'startTalking': (evt: EslEvent) => void;
    'stopTalking': (evt: EslEvent) => void;
    'muteDetect': (evt: EslEvent) => void;
    'unmuteMember': (evt: EslEvent) => void;
    'muteMember': (evt: EslEvent) => void;
    'kickMember': (evt: EslEvent) => void;
    'dtmfMember': (evt: EslEvent) => void;
    'startRecording': (evt: EslEvent) => void;
    'stopRecording': (evt: EslEvent) => void;
    'playFile': (evt: EslEvent) => void;
    'playFileMember': (evt: EslEvent) => void;
    'playFileDone': (evt: EslEvent) => void;
    'lock': (evt: EslEvent) => void;
    'unlock': (evt: EslEvent) => void;
    'transfer': (evt: EslEvent) => void;
    'record': (evt: EslEvent) => void;

  }
}

declare interface Conference {
  on<U extends keyof Conference.Events>(event: U, listener: Conference.Events[U]): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  once<U extends keyof Conference.Events>(event: U, listener: Conference.Events[U]): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;

  off<U extends keyof Conference.Events>(event: U, listener: Conference.Events[U]): this;
  off(event: string | symbol, listener: (...args: any[]) => void): this;

  emit<U extends keyof Conference.Events>(event: U, ...args: Parameters<Conference.Events[U]>): boolean;
  emit(event: string | symbol, ...args: any[]): boolean;
}
namespace Conference {
  export interface Events {

    'addMember': (evt: EslEvent) => void;
    'delMember': (evt: EslEvent) => void;
    'startTalking': (evt: EslEvent) => void;
    'stopTalking': (evt: EslEvent) => void;
    'muteDetect': (evt: EslEvent) => void;
    'unmuteMember': (evt: EslEvent) => void;
    'muteMember': (evt: EslEvent) => void;
    'kickMember': (evt: EslEvent) => void;
    'dtmfMember': (evt: EslEvent) => void;
    'startRecording': (evt: EslEvent) => void;
    'stopRecording': (evt: EslEvent) => void;
    'playFile': (evt: EslEvent) => void;
    'playFileMember': (evt: EslEvent) => void;
    'playFileDone': (evt: EslEvent) => void;
    'lock': (evt: EslEvent) => void;
    'unlock': (evt: EslEvent) => void;
    'transfer': (evt: EslEvent) => void;
    'record': (evt: EslEvent) => void;

  }
}

declare interface Conference {
  on<U extends keyof Conference.Events>(event: U, listener: Conference.Events[U]): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  once<U extends keyof Conference.Events>(event: U, listener: Conference.Events[U]): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;

  off<U extends keyof Conference.Events>(event: U, listener: Conference.Events[U]): this;
  off(event: string | symbol, listener: (...args: any[]) => void): this;

  emit<U extends keyof Conference.Events>(event: U, ...args: Parameters<Conference.Events[U]>): boolean;
  emit(event: string | symbol, ...args: any[]): boolean;
}
class Conference extends EventEmitter {
  private _endpoint: Endpoint;
  public name: string;
  public uuid: string;
  public recordFile: string | null;
  public state: State;
  public locked: boolean;
  public memberId: number;
  public participants: Map<number, any>;
  public maxMembers: number;
  private _playCommands: Record<string, any[]>;

  constructor(name: string, uuid: string, endpoint: Endpoint, opts?: Conference.CreateOptions) {
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

  get endpoint(): Endpoint {
    return this._endpoint;
  }

  get mediaserver(): MediaServer {
    return this.endpoint.mediaserver;
  }

  destroy(callback?: Conference.OperationCallback): Promise<void> | this {
    debug(`Conference#destroy - destroying conference ${this.name}`);
    const __x = (cb: (err: Error | null) => void) => {
      this.endpoint.destroy(cb as any);
    };

    if (callback) {
      __x(callback);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  getSize(): Promise<number> {
    return (this.list('count') as Promise<any>).then((evt: EslEvent) => {
      try {
        return parseInt(evt.getBody(), 10);
      } catch (err) {
        throw new Error(`unexpected (non-integer) response to conference list summary: ${err}`);
      }
    });
  }

  private _execOp(op: string, args: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): Promise<any> | this {
    if (typeof args === 'function') {
      callback = args;
      args = '';
    }
    args = args || '';
    if (Array.isArray(args)) args = args.join(' ');

    const __x = (cb: Conference.OperationCallback) => {
      this.endpoint.api('conference', `${this.name} ${op} ${args}`, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
        const body = evt.getBody();
        if (['lock', 'unlock', 'mute', 'deaf', 'unmute', 'undeaf'].includes(op)) {
          if (/OK\s+/.test(body)) return cb(err, body);
          return cb(new Error(body));
        }
        return cb(err);
      });
    };

    if (callback) {
      __x(callback);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  agc(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('agc', args || '', callback); }
  list(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('list', args || '', callback); }
  lock(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('lock', args || '', callback); }
  unlock(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('unlock', args || '', callback); }
  mute(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('mute', args || '', callback); }
  deaf(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('deaf', args || '', callback); }
  unmute(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('unmute', args || '', callback); }
  undeaf(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('undeaf', args || '', callback); }
  chkRecord(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('chkRecord', args || '', callback); }

  set(param: string, value: string, callback?: Conference.OperationCallback): Promise<any> | this {
    debug(`Conference#setParam: conference ${this.name} set ${param} ${value}`);
    const __x = (cb: Conference.OperationCallback) => {
      this.endpoint.api('conference', `${this.name} set ${param} ${value}`, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
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
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  get(param: string, callback?: Conference.OperationCallback): Promise<any> | this {
    debug(`Conference#getParam: conference ${this.name} get ${param}`);
    const __x = (cb: Conference.OperationCallback) => {
      this.endpoint.api('conference', `${this.name} get ${param}`, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
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
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  startRecording(file: string, callback?: Conference.OperationCallback): Promise<any> | this {
    assert.ok(typeof file === 'string', "'file' parameter must be provided");

    const __x = (cb: Conference.OperationCallback) => {
      this.recordFile = file;
      this.endpoint.api('conference', `${this.name} recording start ${file}`, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
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
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  pauseRecording(file: string, callback?: Conference.OperationCallback): Promise<any> | this {
    const __x = (cb: Conference.OperationCallback) => {
      this.recordFile = file;
      this.endpoint.api('conference', `${this.name} recording pause ${this.recordFile}`, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
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
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  resumeRecording(file: string, callback?: Conference.OperationCallback): Promise<any> | this {
    const __x = (cb: Conference.OperationCallback) => {
      this.recordFile = file;
      this.endpoint.api('conference', `${this.name} recording resume ${this.recordFile}`, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
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
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  stopRecording(file: string, callback?: Conference.OperationCallback): Promise<any> | this {
    const __x = (cb: Conference.OperationCallback) => {
      this.endpoint.api('conference', `${this.name} recording stop ${this.recordFile}`, (err: Error | null, evt: EslEvent) => {
        if (err) return cb(err);
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
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  play(file: string | string[], callback?: Conference.PlaybackCallback): Promise<Conference.PlaybackResults> | this {
    assert.ok(typeof file === 'string' || Array.isArray(file), 'file param is required and must be a string or array');

    const __x = async (cb: Conference.PlaybackCallback) => {
      const files = typeof file === 'string' ? [file] : file;
      const queued: string[] = [];

      for (const f of files) {
        try {
          const result = await (this.endpoint.api('conference', `${this.name} play ${f}`) as Promise<any>);
          if (result && result.body && -1 !== result.body.indexOf(' not found.')) {
            debug(`file ${f} was not queued because it was not found, or conference is empty`);
          } else {
            queued.push(f);
          }
        } catch {
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
      } else {
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
        if (err) return reject(err);
        resolve(results as Conference.PlaybackResults);
      });
    });
  }

  private _onAddMember(evt: EslEvent) {
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

  private _onDelMember(evt: EslEvent) {
    const memberId = parseInt(evt.getHeader('Member-ID'), 10);
    const size = parseInt(evt.getHeader('Conference-Size'), 10);
    this.participants.delete(memberId);
    debug(`Conference#_onDelMember: removed member ${memberId} from ${this.name} size is ${size}`);
  }

  private _onStartTalking(evt: EslEvent) {
    debug(`Conf ${this.name}:${this.uuid} member ${evt.getHeader('Member-ID')} started talking`);
  }

  private _onStopTalking(evt: EslEvent) {
    debug(`Conf ${this.name}:${this.uuid}  member ${evt.getHeader('Member-ID')} stopped talking`);
  }

  private _onMuteDetect(evt: EslEvent) {
    debug(`Conf ${this.name}:${this.uuid}  muted member ${evt.getHeader('Member-ID')} is talking`);
  }

  private _onUnmuteMember(evt: EslEvent) {
    debug(`Conf ${this.name}:${this.uuid}  member ${evt.getHeader('Member-ID')} has been unmuted`);
  }

  private _onMuteMember(evt: EslEvent) {
    debug(`Conf ${this.name}:${this.uuid}  member ${evt.getHeader('Member-ID')} has been muted`);
  }

  private _onKickMember(evt: EslEvent) {
    debug(`Conf ${this.name}:${this.uuid}  member ${evt.getHeader('Member-ID')} has been kicked`);
  }

  private _onDtmfMember(evt: EslEvent) {
    debug(`Conf ${this.name}:${this.uuid}  member ${evt.getHeader('Member-ID')} has entered DTMF`);
  }

  private _onStartRecording(evt: EslEvent) {
    debug('Conference#_onStartRecording: %s:%s  %O', this.name, this.uuid, evt);
    const err = evt.getHeader('Error');
    if (err) {
      const path = evt.getHeader('Path');
      console.log(`Conference#_onStartRecording: failed to start recording to ${path}: ${err}`);
    }
  }

  private _onStopRecording(evt: EslEvent) {
    debug('Conference#_onStopRecording: %s:%s  %O', this.name, this.uuid, evt);
  }

  private _onPlayFile(evt: EslEvent) {
    const confName = evt.getHeader('Conference-Name');
    const file = evt.getHeader('File');
    debug(`conference-level play has started: ${confName}: ${file}`);
  }

  private _onPlayFileMember(evt: EslEvent) {
    debug(`member-level play for member ${evt.getHeader('Member-ID')} has completed`);
  }

  private _onPlayFileDone(evt: EslEvent) {
    const confName = evt.getHeader('Conference-Name');
    const file = evt.getHeader('File');
    const seconds = parseInt(evt.getHeader('seconds'), 10);
    const milliseconds = parseInt(evt.getHeader('milliseconds'), 10);
    const samples = parseInt(evt.getHeader('samples'), 10);

    debug(`conference-level play has completed: ${confName}: ${file} ${seconds} seconds, ${milliseconds} milliseconds, ${samples} samples`);

    const el = this._playCommands[file];
    if (el) {
      assert(Array.isArray(el), 'Conference#onPlayFileDone: this._playCommands must be an array');
      const obj = el[0];
      obj.seconds += seconds;
      obj.milliseconds += milliseconds;
      obj.samples += samples;

      if (obj.remainingFiles.length === 0) {
        obj.done(null, {
          seconds: obj.seconds,
          milliseconds: obj.milliseconds,
          samples: obj.samples
        });
      } else {
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

  private _onLock(evt: EslEvent) {
    debug('conference has been locked: %O', evt);
  }

  private _onUnlock(evt: EslEvent) {
    debug('conference has been unlocked: %O', evt);
  }

  private _onTransfer(evt: EslEvent) {
    debug('member has been transferred to another conference: %O', evt);
  }

  private _onRecord(evt: EslEvent) {
    debug(`conference record has started or stopped: ${evt}`);
  }

  private __onConferenceEvent(evt: EslEvent) {
    const subclass = evt.getHeader('Event-Subclass');
    if (subclass === 'conference::maintenance') {
      const action = evt.getHeader('Action');
      debug(`Conference#__onConferenceEvent: conference event action: ${action}`);

      const mapping = CONF_ACTION_MAP.get(action);
      if (mapping) {
        this.emit(mapping.event, evt);
        (this as any)[mapping.handler](evt);
      } else {
        unhandled(evt);
      }
    } else {
      debug(`Conference#__onConferenceEvent: got unhandled custom event: ${subclass}`);
    }
  }

  toJSON() {
    return pick(this, 'name state uuid memberId confConn endpoint maxMembers locked recordFile');
  }

  toString(): string {
    return JSON.stringify(this.toJSON());
  }
}

export = Conference;