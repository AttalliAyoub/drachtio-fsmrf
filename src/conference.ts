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

/** Enum representing the lifecycle state of the Conference. */
enum State {
  NOT_CREATED = 1,
  CREATED = 2,
  DESTROYED = 3
}

function unhandled(evt: EslEvent) {
  debug(`unhandled conference event: ${evt.getHeader('Action')}`);
}

namespace Conference {
  /** Configuration options passed when creating a Conference. */
  export interface CreateOptions {
    /** Maximum number of participants allowed in the conference. */
    maxMembers?: number;
  }

  /** General callback signature for Conference operations. */
  export type OperationCallback = (err: Error | null, response?: string | number) => void;
  
  /** Result metrics from a conference playback operation. */
  export type PlaybackResults = {
    seconds: number;
    milliseconds: number;
    samples: number;
  };
  
  /** Callback signature for conference playback operations. */
  export type PlaybackCallback = (err: Error | null, results?: PlaybackResults) => void;
}

namespace Conference {
  export interface Events {
    /** Emitted when a member is added to the conference. */
    'addMember': (evt: EslEvent) => void;
    /** Emitted when a member leaves or is removed from the conference. */
    'delMember': (evt: EslEvent) => void;
    /** Emitted when a member starts talking (VAD). */
    'startTalking': (evt: EslEvent) => void;
    /** Emitted when a member stops talking (VAD). */
    'stopTalking': (evt: EslEvent) => void;
    /** Emitted when a muted member talks. */
    'muteDetect': (evt: EslEvent) => void;
    /** Emitted when a member is unmuted. */
    'unmuteMember': (evt: EslEvent) => void;
    /** Emitted when a member is muted. */
    'muteMember': (evt: EslEvent) => void;
    /** Emitted when a member is kicked from the conference. */
    'kickMember': (evt: EslEvent) => void;
    /** Emitted when a member enters DTMF. */
    'dtmfMember': (evt: EslEvent) => void;
    /** Emitted when the conference starts recording. */
    'startRecording': (evt: EslEvent) => void;
    /** Emitted when the conference stops recording. */
    'stopRecording': (evt: EslEvent) => void;
    /** Emitted when a file playback starts for the entire conference. */
    'playFile': (evt: EslEvent) => void;
    /** Emitted when a file playback starts for a specific member. */
    'playFileMember': (evt: EslEvent) => void;
    /** Emitted when file playback is complete. */
    'playFileDone': (evt: EslEvent) => void;
    /** Emitted when the conference is locked. */
    'lock': (evt: EslEvent) => void;
    /** Emitted when the conference is unlocked. */
    'unlock': (evt: EslEvent) => void;
    /** Emitted when a member is transferred to another conference. */
    'transfer': (evt: EslEvent) => void;
    /** Emitted for general record events. */
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

/**
 * Represents a FreeSWITCH Conference.
 * Conferences are used to bridge multiple endpoints together, allowing multi-party audio,
 * recording, and playback within the room.
 */
class Conference extends EventEmitter {
  private _endpoint: Endpoint;
  
  /** The name of the conference room. */
  public name: string;
  /** The unique ID of the conference room. */
  public uuid: string;
  /** The currently active recording file path, or null if not recording. */
  public recordFile: string | null;
  /** The lifecycle state of the conference. */
  public state: State;
  /** Indicates if the conference is currently locked. */
  public locked: boolean;
  /** The member ID of the underlying endpoint used to establish the conference. */
  public memberId: number;
  /** A Map storing active participants by their member ID. */
  public participants: Map<number, Record<string, unknown>>;
  /** Maximum allowed members. `-1` means unlimited. */
  public maxMembers: number;
  
  private _playCommands: Record<string, Array<{ remainingFiles: string[]; seconds: number; milliseconds: number; samples: number; done?: Conference.PlaybackCallback; }>>;

  /**
   * Internal constructor for Conference.
   * Do not instantiate this directly; use `MediaServer#createConference()`.
   * @internal
   */
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

  /** The endpoint used to anchor this conference. */
  get endpoint(): Endpoint {
    return this._endpoint;
  }

  /** The media server hosting this conference. */
  get mediaserver(): MediaServer {
    return this.endpoint.mediaserver;
  }

  /** Destroys the conference and its underlying anchoring endpoint. */
  destroy(): Promise<void>;
  destroy(callback: Conference.OperationCallback): this;
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

  /** Gets the current number of participants (size) of the conference. */
  getSize(): Promise<number> {
    return (this.list('count') as Promise<string | number | undefined>).then((res: string | number | undefined) => {
      try {
        if (typeof res === 'number') return res;
        return parseInt(String(res), 10);
      } catch (err) {
        throw new Error(`unexpected (non-integer) response to conference list summary: ${err}`);
      }
    });
  }

  private _execOp(op: string, args: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): Promise<string | number | undefined> | this {
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

  /** Controls Automatic Gain Control (AGC). */
  agc(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('agc', args || '', callback); }
  
  /** Lists members and details of the conference. */
  list(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('list', args || '', callback); }
  
  /** Locks the conference to prevent new members from joining. */
  lock(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('lock', args || '', callback); }
  
  /** Unlocks the conference to allow new members to join. */
  unlock(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('unlock', args || '', callback); }
  
  /** Mutes a specific member or all non-moderator members (e.g. 'all'). */
  mute(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('mute', args || '', callback); }
  
  /** Deafens a specific member or all non-moderator members. */
  deaf(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('deaf', args || '', callback); }
  
  /** Unmutes a specific member or all members. */
  unmute(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('unmute', args || '', callback); }
  
  /** Undeafens a specific member or all members. */
  undeaf(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('undeaf', args || '', callback); }
  
  /** Checks recording status. */
  chkRecord(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback) { return this._execOp('chkRecord', args || '', callback); }

  /**
   * Sets a conference parameter.
   * @param param - The parameter to set (e.g. 'max_members').
   * @param value - The value to assign.
   */
  set(param: string, value: string): Promise<string | number | undefined>;
  set(param: string, value: string, callback: Conference.OperationCallback): this;
  set(param: string, value: string, callback?: Conference.OperationCallback): Promise<string | number | undefined> | this {
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

  /**
   * Gets a conference parameter.
   * @param param - The parameter to retrieve.
   */
  get(param: string): Promise<string | number | undefined>;
  get(param: string, callback: Conference.OperationCallback): this;
  get(param: string, callback?: Conference.OperationCallback): Promise<string | number | undefined> | this {
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

  /**
   * Starts recording the conference to a file.
   * @param file - The path to save the recording.
   */
  startRecording(file: string): Promise<string | number | undefined>;
  startRecording(file: string, callback: Conference.OperationCallback): this;
  startRecording(file: string, callback?: Conference.OperationCallback): Promise<string | number | undefined> | this {
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

  /**
   * Pauses an active recording.
   * @param file - The recording file path to pause.
   */
  pauseRecording(file: string): Promise<string | number | undefined>;
  pauseRecording(file: string, callback: Conference.OperationCallback): this;
  pauseRecording(file: string, callback?: Conference.OperationCallback): Promise<string | number | undefined> | this {
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

  /**
   * Resumes a paused recording.
   * @param file - The recording file path to resume.
   */
  resumeRecording(file: string): Promise<string | number | undefined>;
  resumeRecording(file: string, callback: Conference.OperationCallback): this;
  resumeRecording(file: string, callback?: Conference.OperationCallback): Promise<string | number | undefined> | this {
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

  /**
   * Stops an active recording.
   * @param file - The recording file path to stop.
   */
  stopRecording(file: string): Promise<string | number | undefined>;
  stopRecording(file: string, callback: Conference.OperationCallback): this;
  stopRecording(file: string, callback?: Conference.OperationCallback): Promise<string | number | undefined> | this {
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

  /**
   * Plays a file to the entire conference.
   * @param file - The path of the file to play.
   */
  play(file: string | string[]): Promise<Conference.PlaybackResults>;
  play(file: string | string[], callback: Conference.PlaybackCallback): this;
  play(file: string | string[], callback?: Conference.PlaybackCallback): Promise<Conference.PlaybackResults> | this {
    assert.ok(typeof file === 'string' || Array.isArray(file), 'file param is required and must be a string or array');

    const __x = async (cb: Conference.PlaybackCallback) => {
      const files = typeof file === 'string' ? [file] : file;
      const queued: string[] = [];

      for (const f of files) {
        try {
          const result = await (this.endpoint.api('conference', `${this.name} play ${f}`) as Promise<EslEvent>);
          if (result && result.getBody() && -1 !== result.getBody().indexOf(' not found.')) {
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
        if (obj.done) obj.done(null, {
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
        this.emit(mapping.event as keyof Conference.Events, evt);
        (this as any)[mapping.handler](evt);
      } else {
        unhandled(evt);
      }
    } else {
      debug(`Conference#__onConferenceEvent: got unhandled custom event: ${subclass}`);
    }
  }

  /** Gets a JSON serializable representation of this conference. */
  toJSON() {
    return pick(this, 'name state uuid memberId confConn endpoint maxMembers locked recordFile');
  }

  /** Serializes the conference JSON to a string. */
  toString(): string {
    return JSON.stringify(this.toJSON());
  }
}

export = Conference;