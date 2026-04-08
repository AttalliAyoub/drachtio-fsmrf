import { EslEvent } from "./types";
import { EventEmitter } from 'events';
import Endpoint from './endpoint';
import MediaServer from './mediaserver';
/** Enum representing the lifecycle state of the Conference. */
declare enum State {
    NOT_CREATED = 1,
    CREATED = 2,
    DESTROYED = 3
}
declare namespace Conference {
    /** Configuration options passed when creating a Conference. */
    interface CreateOptions {
        /** Maximum number of participants allowed in the conference. */
        maxMembers?: number;
    }
    /** General callback signature for Conference operations. */
    type OperationCallback = (err: Error | null, response?: string | number) => void;
    /** Result metrics from a conference playback operation. */
    type PlaybackResults = {
        seconds: number;
        milliseconds: number;
        samples: number;
    };
    /** Callback signature for conference playback operations. */
    type PlaybackCallback = (err: Error | null, results?: PlaybackResults) => void;
}
declare namespace Conference {
    interface Events {
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
declare class Conference extends EventEmitter {
    private _endpoint;
    /** The name of the conference room. */
    name: string;
    /** The unique ID of the conference room. */
    uuid: string;
    /** The currently active recording file path, or null if not recording. */
    recordFile: string | null;
    /** The lifecycle state of the conference. */
    state: State;
    /** Indicates if the conference is currently locked. */
    locked: boolean;
    /** The member ID of the underlying endpoint used to establish the conference. */
    memberId: number;
    /** A Map storing active participants by their member ID. */
    participants: Map<number, Record<string, unknown>>;
    /** Maximum allowed members. `-1` means unlimited. */
    maxMembers: number;
    private _playCommands;
    /**
     * Internal constructor for Conference.
     * Do not instantiate this directly; use `MediaServer#createConference()`.
     * @internal
     */
    constructor(name: string, uuid: string, endpoint: Endpoint, opts?: Conference.CreateOptions);
    /** The endpoint used to anchor this conference. */
    get endpoint(): Endpoint;
    /** The media server hosting this conference. */
    get mediaserver(): MediaServer;
    /** Destroys the conference and its underlying anchoring endpoint. */
    destroy(): Promise<void>;
    destroy(callback: Conference.OperationCallback): this;
    /** Gets the current number of participants (size) of the conference. */
    getSize(): Promise<number>;
    private _execOp;
    /** Controls Automatic Gain Control (AGC). */
    agc(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    /** Lists members and details of the conference. */
    list(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    /** Locks the conference to prevent new members from joining. */
    lock(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    /** Unlocks the conference to allow new members to join. */
    unlock(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    /** Mutes a specific member or all non-moderator members (e.g. 'all'). */
    mute(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    /** Deafens a specific member or all non-moderator members. */
    deaf(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    /** Unmutes a specific member or all members. */
    unmute(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    /** Undeafens a specific member or all members. */
    undeaf(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    /** Checks recording status. */
    chkRecord(args?: string | string[] | Conference.OperationCallback, callback?: Conference.OperationCallback): this | Promise<string | number | undefined>;
    /**
     * Sets a conference parameter.
     * @param param - The parameter to set (e.g. 'max_members').
     * @param value - The value to assign.
     */
    set(param: string, value: string): Promise<string | number | undefined>;
    set(param: string, value: string, callback: Conference.OperationCallback): this;
    /**
     * Gets a conference parameter.
     * @param param - The parameter to retrieve.
     */
    get(param: string): Promise<string | number | undefined>;
    get(param: string, callback: Conference.OperationCallback): this;
    /**
     * Starts recording the conference to a file.
     * @param file - The path to save the recording.
     */
    startRecording(file: string): Promise<string | number | undefined>;
    startRecording(file: string, callback: Conference.OperationCallback): this;
    /**
     * Pauses an active recording.
     * @param file - The recording file path to pause.
     */
    pauseRecording(file: string): Promise<string | number | undefined>;
    pauseRecording(file: string, callback: Conference.OperationCallback): this;
    /**
     * Resumes a paused recording.
     * @param file - The recording file path to resume.
     */
    resumeRecording(file: string): Promise<string | number | undefined>;
    resumeRecording(file: string, callback: Conference.OperationCallback): this;
    /**
     * Stops an active recording.
     * @param file - The recording file path to stop.
     */
    stopRecording(file: string): Promise<string | number | undefined>;
    stopRecording(file: string, callback: Conference.OperationCallback): this;
    /**
     * Plays a file to the entire conference.
     * @param file - The path of the file to play.
     */
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
    /** Gets a JSON serializable representation of this conference. */
    toJSON(): Partial<this>;
    /** Serializes the conference JSON to a string. */
    toString(): string;
}
export = Conference;
