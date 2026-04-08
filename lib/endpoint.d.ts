import { EslConnection, EslEvent, Srf, SrfDialog } from "./types";
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
        [key: string]: unknown;
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
    interface PlaybackResults {
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
    type PlayOperationCallback = (err: Error | null, results?: PlaybackResults) => void;
}
declare namespace Endpoint {
    interface Events {
        'ready': () => void;
        'dtmf': (args: {
            dtmf: string;
            duration: string;
            source: string;
            ssrc?: string;
            timestamp?: string;
        }) => void;
        'tone': (args: {
            tone: string;
        }) => void;
        'playback-start': (opts: any) => void;
        'playback-stop': (opts: any) => void;
        'channelCallState': (args: {
            state: string;
        }) => void;
        'destroy': (args?: {
            reason?: string;
        }) => void;
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
declare namespace Endpoint {
    interface Events {
        'ready': () => void;
        'dtmf': (args: {
            dtmf: string;
            duration: string;
            source: string;
            ssrc?: string;
            timestamp?: string;
        }) => void;
        'tone': (args: {
            tone: string;
        }) => void;
        'playback-start': (opts: any) => void;
        'playback-stop': (opts: any) => void;
        'channelCallState': (args: {
            state: string;
        }) => void;
        'destroy': (args?: {
            reason?: string;
        }) => void;
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
    constructor(conn: EslConnection, dialog: SrfDialog, ms: MediaServer, opts?: Endpoint.CreateOptions);
    get mediaserver(): MediaServer;
    get ms(): MediaServer;
    get srf(): Srf;
    get conn(): EslConnection;
    get dialog(): SrfDialog;
    set dialog(dlg: any);
    get connected(): boolean;
    get muted(): boolean;
    filter(header: string, value: string): void;
    request(opts: any): Promise<import("drachtio-srf/lib/response")> | undefined;
    private _setOrExport;
    set(param: string | object): Promise<EslEvent>;
    set(param: string | object, value: string): Promise<EslEvent>;
    set(param: string | object, callback: Endpoint.OperationCallback): this;
    set(param: string | object, value: string, callback: Endpoint.OperationCallback): this;
    export(param: string | object): Promise<EslEvent>;
    export(param: string | object, value: string): Promise<EslEvent>;
    export(param: string | object, callback: Endpoint.OperationCallback): this;
    export(param: string | object, value: string, callback: Endpoint.OperationCallback): this;
    resetEslCustomEvent(): void;
    addCustomEventListener(event: string, handler: (...args: any[]) => void): void;
    removeCustomEventListener(event: string, handler?: (...args: any[]) => void): void;
    getChannelVariables(): Promise<Record<string, string>>;
    getChannelVariables(includeMedia: boolean): Promise<Record<string, string>>;
    getChannelVariables(callback: Endpoint.OperationCallback): this;
    getChannelVariables(includeMedia: boolean, callback: Endpoint.OperationCallback): this;
    private _onCustomEvent;
    play(file: string | string[] | Endpoint.PlaybackOptions): Promise<Endpoint.PlaybackResults>;
    play(file: string | string[] | Endpoint.PlaybackOptions, callback: Endpoint.PlayOperationCallback): this;
    playCollect(opts: Endpoint.PlayCollectOptions): Promise<Endpoint.PlaybackResults>;
    playCollect(opts: Endpoint.PlayCollectOptions, callback: Endpoint.PlayOperationCallback): this;
    say(text: string, opts: any): Promise<Endpoint.PlaybackResults>;
    say(text: string, opts: any, callback: Endpoint.PlayOperationCallback): this;
    speak(opts: any): Promise<Endpoint.PlaybackResults>;
    speak(opts: any, callback: Endpoint.OperationCallback): this;
    join(conf: string | Conference): Promise<{
        confUuid: string;
    }>;
    join(conf: string | Conference, opts: Endpoint.ConfJoinOptions): Promise<{
        confUuid: string;
    }>;
    join(conf: string | Conference, callback: Endpoint.OperationCallback): this;
    join(conf: string | Conference, opts: Endpoint.ConfJoinOptions, callback: Endpoint.OperationCallback): this;
    bridge(other: string | Endpoint): Promise<EslEvent>;
    bridge(other: string | Endpoint, callback: Endpoint.OperationCallback): this;
    unbridge(): Promise<EslEvent>;
    unbridge(callback: Endpoint.OperationCallback): this;
    getNonMatchingConfParticipants(confName: string, tag: string): Promise<EslEvent>;
    getNonMatchingConfParticipants(confName: string, tag: string, callback: Endpoint.OperationCallback): this;
    setGain(opts: any): Promise<EslEvent>;
    setGain(opts: any, callback: Endpoint.OperationCallback): this;
    dub(opts: any): Promise<EslEvent>;
    dub(opts: any, callback: Endpoint.OperationCallback): this;
    startTranscription(opts: any): Promise<EslEvent>;
    startTranscription(opts: any, callback: Endpoint.OperationCallback): this;
    startTranscriptionTimers(opts: any): Promise<EslEvent>;
    startTranscriptionTimers(opts: any, callback: Endpoint.OperationCallback): this;
    stopTranscription(opts: any): Promise<EslEvent>;
    stopTranscription(opts: any, callback: Endpoint.OperationCallback): this;
    startVadDetection(opts: any): Promise<EslEvent>;
    startVadDetection(opts: any, callback: Endpoint.OperationCallback): this;
    stopVadDetection(opts: any): Promise<EslEvent>;
    stopVadDetection(opts: any, callback: Endpoint.OperationCallback): this;
    forkAudioStart(opts: any): Promise<EslEvent>;
    forkAudioStart(opts: any, callback: Endpoint.OperationCallback): this;
    forkAudioSendText(bugname: any): Promise<EslEvent>;
    forkAudioSendText(bugname: any, metadata: any): Promise<EslEvent>;
    forkAudioSendText(callback: Endpoint.OperationCallback): this;
    forkAudioSendText(bugname: any, callback: Endpoint.OperationCallback): this;
    forkAudioSendText(bugname: any, metadata: any, callback: Endpoint.OperationCallback): this;
    forkAudioStop(): Promise<EslEvent>;
    forkAudioStop(bugname: any): Promise<EslEvent>;
    forkAudioStop(bugname: any, metadata: any): Promise<EslEvent>;
    forkAudioStop(callback: Endpoint.OperationCallback): this;
    forkAudioStop(bugname: any, callback: Endpoint.OperationCallback): this;
    forkAudioStop(bugname: any, metadata: any, callback: Endpoint.OperationCallback): this;
    forkAudioPause(): Promise<EslEvent>;
    forkAudioPause(bugname: any): Promise<EslEvent>;
    forkAudioPause(bugname: any, silence: any): Promise<EslEvent>;
    forkAudioPause(callback: Endpoint.OperationCallback): this;
    forkAudioPause(bugname: any, callback: Endpoint.OperationCallback): this;
    forkAudioPause(bugname: any, silence: any, callback: Endpoint.OperationCallback): this;
    forkAudioResume(): Promise<EslEvent>;
    forkAudioResume(bugname: any): Promise<EslEvent>;
    forkAudioResume(callback: Endpoint.OperationCallback): this;
    forkAudioResume(bugname: any, callback: Endpoint.OperationCallback): this;
    mute(): Promise<EslEvent>;
    mute(callback: Endpoint.OperationCallback): this;
    unmute(): Promise<EslEvent>;
    unmute(callback: Endpoint.OperationCallback): this;
    toggleMute(): Promise<EslEvent>;
    toggleMute(callback: Endpoint.OperationCallback): this;
    api(command: string): Promise<EslEvent>;
    api(command: string, args: string | string[]): Promise<EslEvent>;
    api(command: string, callback: Endpoint.OperationCallback): this;
    api(command: string, args: string | string[], callback: Endpoint.OperationCallback): this;
    execute(app: string): Promise<EslEvent>;
    execute(app: string, arg: string): Promise<EslEvent>;
    execute(app: string, callback: Endpoint.OperationCallback): this;
    execute(app: string, arg: string, callback: Endpoint.OperationCallback): this;
    executeAsync(app: string, arg: string, callback?: any): void | undefined;
    modify(newSdp: string): Promise<any> | undefined;
    destroy(): Promise<void>;
    destroy(callback: Endpoint.OperationCallback): this;
    destroy(): Promise<void>;
    destroy(callback: Endpoint.OperationCallback): this;
    recordSession(...args: any[]): Promise<EslEvent>;
    private _endpointApps;
    record(file: string): Promise<EslEvent>;
    record(file: string, opts: Endpoint.RecordOptions): Promise<EslEvent>;
    record(file: string, callback: Endpoint.OperationCallback): this;
    record(file: string, opts: Endpoint.RecordOptions, callback: Endpoint.OperationCallback): this;
    private _confOp;
    confMute(args?: any, callback?: Endpoint.OperationCallback): this;
    confUnmute(args?: any, callback?: Endpoint.OperationCallback): this;
    confDeaf(args?: any, callback?: Endpoint.OperationCallback): this;
    confUndeaf(args?: any, callback?: Endpoint.OperationCallback): this;
    confKick(args?: any, callback?: Endpoint.OperationCallback): this;
    confHup(args?: any, callback?: Endpoint.OperationCallback): this;
    unjoin(args?: any, callback?: Endpoint.OperationCallback): this;
    confTmute(args?: any, callback?: Endpoint.OperationCallback): this;
    confVmute(args?: any, callback?: Endpoint.OperationCallback): this;
    confUnvmute(args?: any, callback?: Endpoint.OperationCallback): this;
    confVmuteSnap(args?: any, callback?: Endpoint.OperationCallback): this;
    confSaymember(args?: any, callback?: Endpoint.OperationCallback): this;
    confDtmf(args?: any, callback?: Endpoint.OperationCallback): this;
    confPlay(file: string): Promise<EslEvent>;
    confPlay(file: string, opts: any): Promise<EslEvent>;
    confPlay(file: string, callback: Endpoint.OperationCallback): this;
    confPlay(file: string, opts: any, callback: Endpoint.OperationCallback): this;
    transfer(newConf: string | Conference): Promise<EslEvent>;
    transfer(newConf: string | Conference, callback: Endpoint.OperationCallback): this;
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
