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
    /** Options used when creating a new Endpoint. */
    interface CreateOptions {
        /** Directory for debug logs/captures. */
        debugDir?: string;
        /** Single codec or array of codecs to restrict the media negotiation. */
        codecs?: string | string[];
        /** Set to true if creating an endpoint for Third-Party Call Control (3PCC). */
        is3pcc?: boolean;
        /** Array of custom FreeSWITCH events to subscribe to. */
        customEvents?: string[];
        /** Additional custom options. */
        [key: string]: unknown;
    }
    /** Options for playing a file to an endpoint. */
    interface PlaybackOptions {
        /** The path or URI of the file to play. */
        file: string;
        /** Offset in samples/ms to seek into the file before playing. */
        seekOffset?: number;
        /** Maximum duration in seconds to play the file. */
        timeoutSecs?: number;
    }
    /** Options for playing a file and collecting DTMF digits. */
    interface PlayCollectOptions {
        /** The path or URI of the file to play. */
        file: string;
        /** Minimum number of digits to collect (default: 0). */
        min?: number;
        /** Maximum number of digits to collect (default: 128). */
        max?: number;
        /** Number of attempts to play the file (default: 1). */
        tries?: number;
        /** File to play if invalid digits are entered. */
        invalidFile?: string;
        /** Overall timeout in milliseconds (default: 120000). */
        timeout?: number;
        /** String of terminator keys (e.g. '#*'). Default is '#'. */
        terminators?: string;
        /** Variable name to store the collected digits in FreeSWITCH. */
        varName?: string;
        /** Regular expression to validate collected digits. */
        regexp?: string;
        /** Inter-digit timeout in milliseconds. */
        digitTimeout?: number;
    }
    /** Options for recording a session. */
    interface RecordOptions {
        /** Maximum duration of the recording in seconds. */
        timeLimitSecs?: number;
        /** Silence threshold to trigger silence detection. */
        silenceThresh?: number;
        /** Number of silence hits before terminating the recording. */
        silenceHits?: number;
    }
    /** Options for joining a conference. */
    interface ConfJoinOptions {
        /** PIN code required to join. */
        pin?: string;
        /** Conference profile to use. */
        profile?: string;
        /** Flags to configure the member's capabilities in the conference. */
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
    /** Generic callback signature for Endpoint operations. */
    type OperationCallback = (err: Error | null, ...results: any[]) => void;
    /** Results returned from a playback or playCollect operation. */
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
    /** Callback signature for playback operations. */
    type PlayOperationCallback = (err: Error | null, results?: PlaybackResults) => void;
}
declare namespace Endpoint {
    interface Events {
        /** Emitted when the endpoint is fully connected and ready for commands. */
        'ready': () => void;
        /** Emitted when a DTMF digit is detected. */
        'dtmf': (args: {
            dtmf: string;
            duration: string;
            source: string;
            ssrc?: string;
            timestamp?: string;
        }) => void;
        /** Emitted when a specific tone (like fax) is detected. */
        'tone': (args: {
            tone: string;
        }) => void;
        /** Emitted when playback starts on the endpoint. */
        'playback-start': (opts: any) => void;
        /** Emitted when playback stops on the endpoint. */
        'playback-stop': (opts: any) => void;
        /** Emitted when the call state changes. */
        'channelCallState': (args: {
            state: string;
        }) => void;
        /** Emitted when the endpoint is destroyed or hung up. */
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
/**
 * Represents a SIP media leg on the FreeSWITCH media server.
 * Enables media control operations such as playing files, collecting DTMF,
 * recording, joining conferences, and bridging to other endpoints.
 */
declare class Endpoint extends EventEmitter {
    private _customEvents;
    private _conn;
    private _ms;
    private _dialog;
    /** The unique channel ID assigned by FreeSWITCH for this endpoint. */
    uuid: string;
    /** Indicates if the endpoint is using secure media (SRTP). */
    secure: boolean;
    /** Local connection details (SDP, IP, Port). */
    local: {
        sdp?: string;
        mediaIp?: string;
        mediaPort?: string;
    };
    /** Remote connection details (SDP, IP, Port). */
    remote: {
        sdp?: string;
        mediaIp?: string;
        mediaPort?: string;
    };
    /** SIP specific attributes. */
    sip: {
        callId?: string;
    };
    /** Conference details if the endpoint is joined to a conference. */
    conf: {
        memberId?: number;
        name?: string;
        uuid?: string;
    };
    /** The connection state of the endpoint. */
    state: State;
    private _muted;
    private _ready;
    private _joinCallback?;
    /** The DTMF payload type negotiated via SDP. */
    dtmfType?: string;
    /**
     * Internal constructor for Endpoint.
     * Do not instantiate this directly; instead, use `MediaServer#createEndpoint()`.
     * @internal
     */
    constructor(conn: EslConnection, dialog: SrfDialog, ms: MediaServer, opts?: Endpoint.CreateOptions);
    /** Gets the MediaServer instance this endpoint is connected to. */
    get mediaserver(): MediaServer;
    /** Gets the MediaServer instance this endpoint is connected to. */
    get ms(): MediaServer;
    /** Gets the underlying drachtio-srf instance. */
    get srf(): Srf;
    /** Gets the underlying FreeSWITCH Event Socket Connection for this endpoint. */
    get conn(): EslConnection;
    /** Gets the associated SIP Dialog from drachtio-srf. */
    get dialog(): SrfDialog;
    /** Sets the SIP Dialog for this endpoint. */
    set dialog(dlg: any);
    /** Indicates whether the endpoint is currently connected. */
    get connected(): boolean;
    /** Indicates whether the endpoint is currently muted. */
    get muted(): boolean;
    /** Applies an event filter on the FreeSWITCH event socket. */
    filter(header: string, value: string): void;
    /** Forwards an in-dialog SIP request. */
    request(opts: any): Promise<import("drachtio-srf/lib/response")> | undefined;
    private _setOrExport;
    /**
     * Sets one or more channel variables on the endpoint.
     *
     * @param param - A string variable name or an object of key-value pairs.
     * @param value - The value to set (if `param` is a string).
     */
    set(param: string | object): Promise<EslEvent>;
    set(param: string | object, value: string): Promise<EslEvent>;
    set(param: string | object, callback: Endpoint.OperationCallback): this;
    set(param: string | object, value: string, callback: Endpoint.OperationCallback): this;
    /**
     * Exports one or more channel variables to the endpoint (so they apply to bridged channels).
     *
     * @param param - A string variable name or an object of key-value pairs.
     * @param value - The value to export (if `param` is a string).
     */
    export(param: string | object): Promise<EslEvent>;
    export(param: string | object, value: string): Promise<EslEvent>;
    export(param: string | object, callback: Endpoint.OperationCallback): this;
    export(param: string | object, value: string, callback: Endpoint.OperationCallback): this;
    /** Resets custom event listeners on the Event Socket connection. */
    resetEslCustomEvent(): void;
    /**
     * Adds a custom FreeSWITCH event listener.
     *
     * @param event - The custom event subclass name (without the "CUSTOM " prefix).
     * @param handler - The function to call when the event occurs.
     */
    addCustomEventListener(event: string, handler: (...args: any[]) => void): void;
    /**
     * Removes a custom FreeSWITCH event listener.
     *
     * @param event - The custom event subclass name.
     * @param handler - The specific handler to remove (optional).
     */
    removeCustomEventListener(event: string, handler?: (...args: any[]) => void): void;
    /**
     * Retrieves all channel variables for this endpoint.
     *
     * @param includeMedia - Whether to include media stats (e.g. `uuid_set_media_stats`).
     * @returns A Promise resolving to an object containing all variables.
     */
    getChannelVariables(): Promise<Record<string, string>>;
    getChannelVariables(includeMedia: boolean): Promise<Record<string, string>>;
    getChannelVariables(callback: Endpoint.OperationCallback): this;
    getChannelVariables(includeMedia: boolean, callback: Endpoint.OperationCallback): this;
    private _onCustomEvent;
    /**
     * Plays an audio or video file to the endpoint.
     *
     * @param file - File path, array of file paths, or PlaybackOptions object.
     * @returns A Promise resolving to playback metrics (duration, completion status).
     */
    play(file: string | string[] | Endpoint.PlaybackOptions): Promise<Endpoint.PlaybackResults>;
    play(file: string | string[] | Endpoint.PlaybackOptions, callback: Endpoint.PlayOperationCallback): this;
    /**
     * Plays a file while collecting DTMF digits.
     *
     * @param opts - Options for playback and DTMF collection constraints.
     * @returns A Promise resolving to the digits collected and playback results.
     */
    playCollect(opts: Endpoint.PlayCollectOptions): Promise<Endpoint.PlaybackResults>;
    playCollect(opts: Endpoint.PlayCollectOptions, callback: Endpoint.PlayOperationCallback): this;
    /**
     * Speaks text using a TTS engine via the FreeSWITCH `say` application.
     *
     * @param text - The text string to say.
     * @param opts - Options including language, sayType, and sayMethod.
     */
    say(text: string, opts: any): Promise<Endpoint.PlaybackResults>;
    say(text: string, opts: any, callback: Endpoint.PlayOperationCallback): this;
    /**
     * Speaks text using a TTS engine via the FreeSWITCH `speak` application.
     *
     * @param opts - Options dictating ttsEngine, voice, and text.
     */
    speak(opts: any): Promise<Endpoint.PlaybackResults>;
    speak(opts: any, callback: Endpoint.OperationCallback): this;
    /**
     * Joins the endpoint to a conference room.
     *
     * @param conf - A Conference instance or the string name of the conference.
     * @param opts - Additional join options (e.g. flags, pin).
     * @returns A Promise resolving to an object containing `confUuid` and the endpoint's `memberId`.
     */
    join(conf: string | Conference): Promise<{
        confUuid: string;
        memberId?: number;
    }>;
    join(conf: string | Conference, opts: Endpoint.ConfJoinOptions): Promise<{
        confUuid: string;
        memberId?: number;
    }>;
    join(conf: string | Conference, callback: Endpoint.OperationCallback): this;
    join(conf: string | Conference, opts: Endpoint.ConfJoinOptions, callback: Endpoint.OperationCallback): this;
    /**
     * Bridges this endpoint with another endpoint for direct peer-to-peer media sharing.
     *
     * @param other - The other Endpoint or its UUID string.
     */
    bridge(other: string | Endpoint): Promise<EslEvent>;
    bridge(other: string | Endpoint, callback: Endpoint.OperationCallback): this;
    /**
     * Unbridges this endpoint if it is currently bridged with another endpoint.
     */
    unbridge(): Promise<EslEvent>;
    unbridge(callback: Endpoint.OperationCallback): this;
    /**
     * Gets participants in a conference that do not match a given tag.
     */
    getNonMatchingConfParticipants(confName: string, tag: string): Promise<EslEvent>;
    getNonMatchingConfParticipants(confName: string, tag: string, callback: Endpoint.OperationCallback): this;
    /**
     * Adjusts the read gain (volume) for this endpoint.
     * @param opts - Either the numeric gain level or string representing gain (+/- dB).
     */
    setGain(opts: any): Promise<EslEvent>;
    setGain(opts: any, callback: Endpoint.OperationCallback): this;
    /**
     * Executes a media dubbing operation on a specific track for this endpoint.
     */
    dub(opts: any): Promise<EslEvent>;
    dub(opts: any, callback: Endpoint.OperationCallback): this;
    /** Starts transcription via an integrated engine (e.g. Google, AWS, Nuance). */
    startTranscription(opts: any): Promise<EslEvent>;
    startTranscription(opts: any, callback: Endpoint.OperationCallback): this;
    /** Starts transcription timers. */
    startTranscriptionTimers(opts: any): Promise<EslEvent>;
    startTranscriptionTimers(opts: any, callback: Endpoint.OperationCallback): this;
    /** Stops an active transcription process. */
    stopTranscription(opts: any): Promise<EslEvent>;
    stopTranscription(opts: any, callback: Endpoint.OperationCallback): this;
    /** Starts Voice Activity Detection (VAD). */
    startVadDetection(opts: any): Promise<EslEvent>;
    startVadDetection(opts: any, callback: Endpoint.OperationCallback): this;
    /** Stops Voice Activity Detection (VAD). */
    stopVadDetection(opts: any): Promise<EslEvent>;
    stopVadDetection(opts: any, callback: Endpoint.OperationCallback): this;
    /** Starts audio forking to a WebSocket URL. */
    forkAudioStart(opts: any): Promise<EslEvent>;
    forkAudioStart(opts: any, callback: Endpoint.OperationCallback): this;
    /** Sends text metadata through an active audio fork. */
    forkAudioSendText(bugname: any): Promise<EslEvent>;
    forkAudioSendText(bugname: any, metadata: any): Promise<EslEvent>;
    forkAudioSendText(callback: Endpoint.OperationCallback): this;
    forkAudioSendText(bugname: any, callback: Endpoint.OperationCallback): this;
    forkAudioSendText(bugname: any, metadata: any, callback: Endpoint.OperationCallback): this;
    /** Stops an active audio fork. */
    forkAudioStop(): Promise<EslEvent>;
    forkAudioStop(bugname: any): Promise<EslEvent>;
    forkAudioStop(bugname: any, metadata: any): Promise<EslEvent>;
    forkAudioStop(callback: Endpoint.OperationCallback): this;
    forkAudioStop(bugname: any, callback: Endpoint.OperationCallback): this;
    forkAudioStop(bugname: any, metadata: any, callback: Endpoint.OperationCallback): this;
    /** Pauses an active audio fork. */
    forkAudioPause(): Promise<EslEvent>;
    forkAudioPause(bugname: any): Promise<EslEvent>;
    forkAudioPause(bugname: any, silence: any): Promise<EslEvent>;
    forkAudioPause(callback: Endpoint.OperationCallback): this;
    forkAudioPause(bugname: any, callback: Endpoint.OperationCallback): this;
    forkAudioPause(bugname: any, silence: any, callback: Endpoint.OperationCallback): this;
    /** Resumes a paused audio fork. */
    forkAudioResume(): Promise<EslEvent>;
    forkAudioResume(bugname: any): Promise<EslEvent>;
    forkAudioResume(callback: Endpoint.OperationCallback): this;
    forkAudioResume(bugname: any, callback: Endpoint.OperationCallback): this;
    /** Mutes media flowing from the endpoint. */
    mute(): Promise<EslEvent>;
    mute(callback: Endpoint.OperationCallback): this;
    /** Unmutes media flowing from the endpoint. */
    unmute(): Promise<EslEvent>;
    unmute(callback: Endpoint.OperationCallback): this;
    /** Toggles the mute state of the endpoint. */
    toggleMute(): Promise<EslEvent>;
    toggleMute(callback: Endpoint.OperationCallback): this;
    /** Executes a FreeSWITCH API command specifically applied to this endpoint. */
    api(command: string): Promise<EslEvent>;
    api(command: string, args: string | string[]): Promise<EslEvent>;
    api(command: string, callback: Endpoint.OperationCallback): this;
    api(command: string, args: string | string[], callback: Endpoint.OperationCallback): this;
    /**
     * Executes a dialplan application on this endpoint.
     * @param app - The application to execute (e.g., 'playback', 'record').
     * @param arg - The arguments for the application.
     */
    execute(app: string): Promise<EslEvent>;
    execute(app: string, arg: string): Promise<EslEvent>;
    execute(app: string, callback: Endpoint.OperationCallback): this;
    execute(app: string, arg: string, callback: Endpoint.OperationCallback): this;
    /**
     * Executes a dialplan application asynchronously on this endpoint.
     */
    executeAsync(app: string, arg: string, callback?: any): void | undefined;
    /**
     * Modifies the session using a new SDP.
     * @param newSdp - The updated Session Description Protocol string.
     */
    modify(newSdp: string): Promise<any> | undefined;
    /**
     * Disconnects the endpoint, terminating the SIP call and FreeSWITCH channel.
     */
    destroy(): Promise<void>;
    destroy(callback: Endpoint.OperationCallback): this;
    destroy(): Promise<void>;
    destroy(callback: Endpoint.OperationCallback): this;
    /**
     * Executes the `record_session` dialplan application.
     */
    recordSession(...args: any[]): Promise<EslEvent>;
    private _endpointApps;
    /**
     * Records audio from the endpoint to a file.
     * @param file - The destination file path.
     * @param opts - Options such as time limits or silence detection.
     */
    record(file: string): Promise<EslEvent>;
    record(file: string, opts: Endpoint.RecordOptions): Promise<EslEvent>;
    record(file: string, callback: Endpoint.OperationCallback): this;
    record(file: string, opts: Endpoint.RecordOptions, callback: Endpoint.OperationCallback): this;
    private _confOp;
    /** Mutes this endpoint within its active conference. */
    confMute(args?: any, callback?: Endpoint.OperationCallback): this;
    /** Unmutes this endpoint within its active conference. */
    confUnmute(args?: any, callback?: Endpoint.OperationCallback): this;
    /** Deafens this endpoint within its active conference. */
    confDeaf(args?: any, callback?: Endpoint.OperationCallback): this;
    /** Undeafens this endpoint within its active conference. */
    confUndeaf(args?: any, callback?: Endpoint.OperationCallback): this;
    /** Kicks this endpoint from the conference. */
    confKick(args?: any, callback?: Endpoint.OperationCallback): this;
    /** Hangs up this endpoint from the conference. */
    confHup(args?: any, callback?: Endpoint.OperationCallback): this;
    /** Leaves the conference without hanging up the call. */
    unjoin(args?: any, callback?: Endpoint.OperationCallback): this;
    /** Toggles mute for this endpoint within its active conference. */
    confTmute(args?: any, callback?: Endpoint.OperationCallback): this;
    /** Video mutes this endpoint within its active conference. */
    confVmute(args?: any, callback?: Endpoint.OperationCallback): this;
    /** Video unmutes this endpoint within its active conference. */
    confUnvmute(args?: any, callback?: Endpoint.OperationCallback): this;
    /** Video snap mutes this endpoint within its active conference. */
    confVmuteSnap(args?: any, callback?: Endpoint.OperationCallback): this;
    /** Executes the `saymember` command on this endpoint in the conference. */
    confSaymember(args?: any, callback?: Endpoint.OperationCallback): this;
    /** Sends DTMF from this endpoint to the conference. */
    confDtmf(args?: any, callback?: Endpoint.OperationCallback): this;
    /**
     * Plays a file exclusively to this endpoint within a conference.
     * @param file - The file to play.
     * @param opts - Options such as volume (`vol`).
     */
    confPlay(file: string): Promise<EslEvent>;
    confPlay(file: string, opts: any): Promise<EslEvent>;
    confPlay(file: string, callback: Endpoint.OperationCallback): this;
    confPlay(file: string, opts: any, callback: Endpoint.OperationCallback): this;
    /**
     * Transfers the endpoint to a different conference.
     * @param newConf - The new Conference instance or its name.
     */
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
    /** Gets a JSON serializable representation of this endpoint. */
    toJSON(): Partial<this>;
    /** Serializes the endpoint JSON to a string. */
    toString(): string;
}
export = Endpoint;
