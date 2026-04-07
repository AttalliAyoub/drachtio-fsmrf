import { EventEmitter } from 'events';
import Conference from './conference';
import MediaServer = require('./mediaserver');
declare enum State {
    NOT_CONNECTED = 1,
    EARLY = 2,
    CONNECTED = 3,
    DISCONNECTED = 4
}
declare namespace Endpoint {
    interface CreateOptions {
        debugDir?: string;
        codecs?: string | string[];
        is3pcc?: boolean;
        customEvents?: string[];
        [key: string]: any;
    }
    interface PlaybackOptions {
        file: string;
        seekOffset?: number;
        timeoutSecs?: number;
    }
    interface PlayCollectOptions {
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
    interface RecordOptions {
        timeLimitSecs?: number;
        silenceThresh?: number;
        silenceHits?: number;
    }
    interface ConfJoinOptions {
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
    type OperationCallback = (err: Error | null, ...results: any[]) => void;
    type PlayOperationCallback = (err: Error | null, results?: any) => void;
}
declare class Endpoint extends EventEmitter {
    private _customEvents;
    private _conn;
    private _ms;
    private _dialog;
    uuid: string;
    secure: boolean;
    local: {
        sdp?: string;
        mediaIp?: string;
        mediaPort?: string;
    };
    remote: {
        sdp?: string;
        mediaIp?: string;
        mediaPort?: string;
    };
    sip: {
        callId?: string;
    };
    conf: {
        memberId?: number;
        name?: string;
        uuid?: string;
    };
    state: State;
    private _muted;
    private _ready;
    private _joinCallback?;
    dtmfType?: string;
    constructor(conn: any, dialog: any, ms: MediaServer, opts?: Endpoint.CreateOptions);
    get mediaserver(): MediaServer;
    get ms(): MediaServer;
    get srf(): any;
    get conn(): any;
    get dialog(): any;
    set dialog(dlg: any);
    get connected(): boolean;
    get muted(): boolean;
    filter(header: string, value: string): void;
    request(opts: any): any;
    private _setOrExport;
    set(param: string | object, value?: string | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<any> | this;
    export(param: string | object, value?: string | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<any> | this;
    resetEslCustomEvent(): void;
    addCustomEventListener(event: string, handler: (...args: any[]) => void): void;
    removeCustomEventListener(event: string, handler?: (...args: any[]) => void): void;
    getChannelVariables(includeMedia?: boolean | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<any> | this;
    private _onCustomEvent;
    play(file: string | string[] | Endpoint.PlaybackOptions, callback?: Endpoint.PlayOperationCallback): Promise<any> | this;
    playCollect(opts: Endpoint.PlayCollectOptions, callback?: Endpoint.PlayOperationCallback): Promise<any> | this;
    say(text: string, opts: any, callback?: Endpoint.PlayOperationCallback): Promise<any> | this;
    speak(opts: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    join(conf: string | Conference, opts?: Endpoint.ConfJoinOptions | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<any> | this;
    bridge(other: string | Endpoint, callback?: Endpoint.OperationCallback): Promise<any> | this;
    unbridge(callback?: Endpoint.OperationCallback): Promise<any> | this;
    getNonMatchingConfParticipants(confName: string, tag: string, callback?: Endpoint.OperationCallback): Promise<any> | this;
    setGain(opts: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    dub(opts: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    startTranscription(opts: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    startTranscriptionTimers(opts: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    stopTranscription(opts: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    startVadDetection(opts: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    stopVadDetection(opts: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    forkAudioStart(opts: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    forkAudioSendText(bugname: any, metadata?: any, callback?: any): Promise<any> | this;
    forkAudioStop(bugname?: any, metadata?: any, callback?: any): Promise<any> | this;
    forkAudioPause(bugname?: any, silence?: any, callback?: any): Promise<any> | this;
    forkAudioResume(bugname?: any, callback?: any): Promise<any> | this;
    mute(callback?: Endpoint.OperationCallback): Promise<any> | this;
    unmute(callback?: Endpoint.OperationCallback): Promise<any> | this;
    toggleMute(callback?: Endpoint.OperationCallback): Promise<any> | this;
    api(command: string, args?: string | string[] | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<any> | this;
    execute(app: string, arg?: string | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<any> | this;
    executeAsync(app: string, arg: string, callback?: any): any;
    modify(newSdp: string): any;
    destroy(callback?: Endpoint.OperationCallback): Promise<any> | this;
    recordSession(...args: any[]): Promise<any> | this;
    private _endpointApps;
    record(file: string, opts?: Endpoint.RecordOptions | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<any> | this;
    private _confOp;
    confMute(args?: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    confUnmute(args?: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    confDeaf(args?: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    confUndeaf(args?: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    confKick(args?: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    confHup(args?: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    unjoin(args?: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    confTmute(args?: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    confVmute(args?: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    confUnvmute(args?: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    confVmuteSnap(args?: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    confSaymember(args?: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    confDtmf(args?: any, callback?: Endpoint.OperationCallback): Promise<any> | this;
    confPlay(file: string, opts?: any | Endpoint.OperationCallback, callback?: Endpoint.OperationCallback): Promise<any> | this;
    transfer(newConf: string | Conference, callback?: Endpoint.OperationCallback): Promise<any> | this;
    private __onConferenceEvent;
    private _onAddMember;
    private _unhandled;
    private _onError;
    private _onChannelCallState;
    private _onDtmf;
    private _onToneDetect;
    private _onPlaybackStart;
    private _onPlaybackStop;
    private _emitReady;
    private _onHangup;
    private _onBye;
    toJSON(): Partial<this>;
    toString(): string;
}
export = Endpoint;
