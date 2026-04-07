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
    type OperationCallback = (err: Error | null, response?: string | any) => void;
    type PlaybackResults = {
        seconds: number;
        milliseconds: number;
        samples: number;
    };
    type PlaybackCallback = (err: Error | null, results?: PlaybackResults) => void;
}
declare class Conference extends EventEmitter {
    private _endpoint;
    name: string;
    uuid: string;
    recordFile: string | null;
    state: State;
    locked: boolean;
    memberId: number;
    participants: Map<number, any>;
    maxMembers: number;
    private _playCommands;
    constructor(name: string, uuid: string, endpoint: Endpoint, opts?: Conference.CreateOptions);
    get endpoint(): Endpoint;
    get mediaserver(): MediaServer;
    destroy(callback?: Conference.OperationCallback): Promise<void> | this;
    getSize(): Promise<number>;
    private _execOp;
    agc(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): Promise<any> | this;
    list(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): Promise<any> | this;
    lock(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): Promise<any> | this;
    unlock(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): Promise<any> | this;
    mute(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): Promise<any> | this;
    deaf(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): Promise<any> | this;
    unmute(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): Promise<any> | this;
    undeaf(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): Promise<any> | this;
    chkRecord(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): Promise<any> | this;
    set(param: string, value: string, callback?: Conference.OperationCallback): Promise<any> | this;
    get(param: string, callback?: Conference.OperationCallback): Promise<any> | this;
    startRecording(file: string, callback?: Conference.OperationCallback): Promise<any> | this;
    pauseRecording(file: string, callback?: Conference.OperationCallback): Promise<any> | this;
    resumeRecording(file: string, callback?: Conference.OperationCallback): Promise<any> | this;
    stopRecording(file: string, callback?: Conference.OperationCallback): Promise<any> | this;
    play(file: string | string[], callback?: Conference.PlaybackCallback): Promise<Conference.PlaybackResults> | this;
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
