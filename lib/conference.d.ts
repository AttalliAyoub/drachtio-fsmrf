import { EslEvent } from "./types";
import { EventEmitter } from 'events';
import Endpoint from './endpoint';
import MediaServer from './mediaserver';
declare enum State {
    NOT_CREATED = 1,
    CREATED = 2,
    DESTROYED = 3
}
declare namespace Conference {
    interface CreateOptions {
        maxMembers?: number;
    }
    type OperationCallback = (err: Error | null, response?: string | number) => void;
    type PlaybackResults = {
        seconds: number;
        milliseconds: number;
        samples: number;
    };
    type PlaybackCallback = (err: Error | null, results?: PlaybackResults) => void;
}
declare namespace Conference {
    interface Events {
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
declare namespace Conference {
    interface Events {
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
declare class Conference extends EventEmitter {
    private _endpoint;
    name: string;
    uuid: string;
    recordFile: string | null;
    state: State;
    locked: boolean;
    memberId: number;
    participants: Map<number, Record<string, unknown>>;
    maxMembers: number;
    private _playCommands;
    constructor(name: string, uuid: string, endpoint: Endpoint, opts?: Conference.CreateOptions);
    get endpoint(): Endpoint;
    get mediaserver(): MediaServer;
    destroy(): Promise<void>;
    destroy(callback: Conference.OperationCallback): this;
    getSize(): Promise<number>;
    private _execOp;
    agc(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    list(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    lock(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    unlock(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    mute(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    deaf(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    unmute(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    undeaf(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    chkRecord(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    set(param: string, value: string): Promise<string | number | undefined>;
    set(param: string, value: string, callback: Conference.OperationCallback): this;
    get(param: string): Promise<string | number | undefined>;
    get(param: string, callback: Conference.OperationCallback): this;
    startRecording(file: string): Promise<string | number | undefined>;
    startRecording(file: string, callback: Conference.OperationCallback): this;
    pauseRecording(file: string): Promise<string | number | undefined>;
    pauseRecording(file: string, callback: Conference.OperationCallback): this;
    resumeRecording(file: string): Promise<string | number | undefined>;
    resumeRecording(file: string, callback: Conference.OperationCallback): this;
    stopRecording(file: string): Promise<string | number | undefined>;
    stopRecording(file: string, callback: Conference.OperationCallback): this;
    play(file: string | string[]): Promise<Conference.PlaybackResults>;
    play(file: string | string[], callback: Conference.PlaybackCallback): this;
    private _onAddMember;
    private _onDelMember;
    private _onStartTalking;
    private _onStopTalking;
    private _onMuteDetect;
    private _onUnmuteMember;
    private _onMuteMember;
    private _onKickMember;
    private _onDtmfMember;
    private _onStartRecording;
    private _onStopRecording;
    private _onPlayFile;
    private _onPlayFileMember;
    private _onPlayFileDone;
    private _onLock;
    private _onUnlock;
    private _onTransfer;
    private _onRecord;
    private __onConferenceEvent;
    toJSON(): Partial<this>;
    toString(): string;
}
export = Conference;
