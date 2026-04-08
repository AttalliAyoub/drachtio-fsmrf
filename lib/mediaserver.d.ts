import { EslConnection, Srf, SrfDialog, SrfRequest, SrfResponse } from "./types";
import { EventEmitter } from 'events';
import Endpoint from './endpoint';
import Conference from './conference';
import Mrf = require('./mrf');
declare namespace MediaServer {
    /**
     * Options for creating a Conference on the media server.
     */
    interface ConferenceCreateOptions {
        /** An optional PIN code required to join the conference. */
        pin?: string;
        /** The FreeSWITCH conference profile to use. */
        profile?: string;
        /** Specific FreeSWITCH conference flags to set. */
        flags?: {
            waitMod?: boolean;
            audioAlways?: boolean;
            videoBridgeFirstTwo?: boolean;
            videoMuxingPersonalCanvas?: boolean;
            videoRequiredForCanvas?: boolean;
            endconf?: boolean;
            mute?: boolean;
            vmute?: boolean;
            [key: string]: boolean | undefined;
        };
        /** Maximum number of members allowed in the conference. */
        maxMembers?: number;
    }
    /**
     * Options for creating a MediaServer Endpoint.
     */
    interface EndpointOptions {
        /** The remote SDP to offer to the FreeSWITCH media server. */
        remoteSdp?: string;
        /** A single codec or an array of codecs to restrict the SDP offer to. */
        codecs?: string[] | string;
        /** Custom SIP headers to include in the INVITE sent to FreeSWITCH. */
        headers?: Record<string, string | boolean>;
        /** Custom FreeSWITCH events to subscribe to for this endpoint. */
        customEvents?: string[];
        /** Whether this is a Third-Party Call Control (3PCC) scenario. */
        is3pcc?: boolean;
        /** If true, indicates SRTP is required. */
        srtp?: boolean;
        /** The IP family to use, 'ipv4' or 'ipv6'. */
        family?: 'ipv4' | 'ipv6';
        /** If true, use DTLS-SRTP. */
        dtls?: boolean;
        /** An AbortSignal to cancel the endpoint creation process. */
        signal?: AbortSignal;
        [key: string]: unknown;
    }
    type CreateEndpointCallback = (err: Error | null, endpoint?: Endpoint) => void;
    type CreateConferenceCallback = (err: Error | null, conference?: Conference) => void;
    type ApiCallback = (response: string) => void;
    type ConnectCallerCallback = (err: Error | null, result?: {
        endpoint?: Endpoint;
        dialog?: SrfDialog;
    }) => void;
    interface PendingConnection {
        dialog?: SrfDialog;
        conn?: EslConnection;
        connTimeout?: NodeJS.Timeout;
        fn?: (...args: any[]) => void;
        createTimeout?: NodeJS.Timeout;
        callback?: (...args: any[]) => void;
    }
}
declare namespace MediaServer {
    interface Events {
        /** Emitted when the outbound event socket server connects. */
        'connect': () => void;
        /** Emitted when the media server has fully initialized and is ready to accept requests. */
        'ready': () => void;
        /** Emitted when an error occurs with the media server connection. */
        'error': (err: Error) => void;
        /** Emitted when the connection to the media server ends. */
        'end': () => void;
        /** Emitted when a new channel (endpoint) is successfully opened. */
        'channel::open': (args: {
            uuid: string;
            countOfConnections: number;
            countOfChannels: number;
        }) => void;
        /** Emitted when an existing channel is closed. */
        'channel::close': (args: {
            uuid: string | undefined;
            countOfConnections: number;
            countOfChannels: number;
        }) => void;
    }
}
declare interface MediaServer {
    on<U extends keyof MediaServer.Events>(event: U, listener: MediaServer.Events[U]): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once<U extends keyof MediaServer.Events>(event: U, listener: MediaServer.Events[U]): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    off<U extends keyof MediaServer.Events>(event: U, listener: MediaServer.Events[U]): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    emit<U extends keyof MediaServer.Events>(event: U, ...args: Parameters<MediaServer.Events[U]>): boolean;
    emit(event: string | symbol, ...args: any[]): boolean;
}
/**
 * Represents a connection to a FreeSWITCH Media Server.
 * Provides methods for executing API commands, creating endpoints (calls to the media server),
 * and managing conferences.
 */
declare class MediaServer extends EventEmitter {
    private _conn;
    private _mrf;
    private _srf;
    /** Map of pending connections waiting for FreeSWITCH outbound event socket callbacks. */
    pendingConnections: Map<string, MediaServer.PendingConnection>;
    private _isMediaServerReady;
    /** Maximum number of concurrent sessions the media server is configured to handle. */
    maxSessions: number;
    /** Current number of active sessions on the media server. */
    currentSessions: number;
    /** Current calls per second (CPS) rate on the media server. */
    cps: number;
    /** Signalling addresses (IPv4/IPv6, UDP/DTLS) gathered from FreeSWITCH configuration. */
    sip: {
        ipv4: {
            udp: {
                address?: string;
            };
            dtls: {
                address?: string;
            };
        };
        ipv6: {
            udp: {
                address?: string;
            };
            dtls: {
                address?: string;
            };
        };
    };
    private _address;
    private closing?;
    /** The local IP address the Event Socket outbound server is listening on. */
    listenAddress?: string;
    /** The local port the Event Socket outbound server is listening on. */
    listenPort?: number;
    /** The IP address advertised to FreeSWITCH for outbound event socket connections. */
    advertisedAddress?: string;
    /** The port advertised to FreeSWITCH for outbound event socket connections. */
    advertisedPort?: number;
    private _server?;
    /** Hostname of the connected FreeSWITCH server. */
    hostname?: string;
    /** IPv4 address of the FreeSWITCH server. */
    v4address?: string;
    /** IPv6 address of the FreeSWITCH server. */
    v6address?: string;
    /** FreeSWITCH version string. */
    fsVersion?: string;
    /** FreeSWITCH idle CPU percentage. */
    cpuIdle?: number;
    /**
     * Internal constructor for MediaServer.
     * Do not instantiate this directly; instead, use `Mrf#connect()`.
     * @internal
     */
    constructor(conn: EslConnection, mrf: Mrf, listenAddress: string, listenPort: number, advertisedAddress?: string, advertisedPort?: number, profile?: string);
    /** Gets the remote IP address of the connected FreeSWITCH server. */
    get address(): string;
    /** Gets the internal FreeSWITCH Event Socket listener connection. */
    get conn(): EslConnection;
    /** Gets the underlying drachtio-srf instance. */
    get srf(): Srf;
    /**
     * Checks if the Event Socket connection to FreeSWITCH is currently active.
     * @returns true if connected, false otherwise
     */
    connected(): boolean;
    /**
     * Gracefully disconnects the media server, closing all sockets and releasing resources.
     */
    disconnect(): void;
    /**
     * Alias for `disconnect()`. Destroys the media server connection.
     */
    destroy(): void;
    /**
     * Checks if the media server has a specific capability based on its SIP configurations.
     * @param capability - A string or array of strings representing the capability to check (e.g., 'ipv4', 'ipv6', 'dtls', 'udp').
     * @returns true if the capability is supported.
     */
    hasCapability(capability: string | string[]): boolean;
    /**
     * Sends a FreeSWITCH API command and retrieves the response.
     * @param command - The FreeSWITCH API command to execute (e.g., 'status', 'show channels').
     * @returns A Promise resolving to the command output string.
     */
    api(command: string): Promise<string>;
    /**
     * Sends a FreeSWITCH API command and invokes the callback with the response.
     * @param command - The FreeSWITCH API command to execute.
     * @param callback - The callback receiving the response string.
     */
    api(command: string, callback: MediaServer.ApiCallback): this;
    /**
     * Creates an Endpoint (a SIP leg pointing to the media server).
     * Used for establishing media sessions such as IVR prompts, bridging, or recordings.
     *
     * @param opts - Options configuring the endpoint (e.g., remote SDP, codecs).
     * @returns A Promise resolving to an Endpoint instance.
     */
    createEndpoint(opts?: MediaServer.EndpointOptions): Promise<Endpoint>;
    /**
     * Creates an Endpoint (a SIP leg pointing to the media server) using a callback.
     *
     * @param opts - Options configuring the endpoint.
     * @param callback - Callback invoked when the endpoint is created.
     */
    createEndpoint(opts: MediaServer.EndpointOptions, callback: MediaServer.CreateEndpointCallback): this;
    createEndpoint(callback: MediaServer.CreateEndpointCallback): this;
    /**
     * Answers an incoming SIP request and connects the caller to the media server.
     * This handles creating the media server endpoint and replying to the caller's INVITE (UAS).
     *
     * @param req - The incoming SIP request (INVITE) from drachtio.
     * @param res - The outgoing SIP response to the caller.
     * @param opts - Endpoint configuration options.
     * @returns A Promise resolving to an object containing the new Endpoint and the UAS SrfDialog.
     */
    connectCaller(req: SrfRequest, res: SrfResponse, opts?: MediaServer.EndpointOptions): Promise<{
        endpoint: Endpoint;
        dialog: SrfDialog;
    }>;
    /**
     * Answers an incoming SIP request and connects the caller to the media server using a callback.
     *
     * @param req - The incoming SIP request.
     * @param res - The outgoing SIP response.
     * @param opts - Endpoint configuration options.
     * @param callback - Callback invoked when the connection is established.
     */
    connectCaller(req: SrfRequest, res: SrfResponse, opts: MediaServer.EndpointOptions, callback: MediaServer.ConnectCallerCallback): this;
    connectCaller(req: SrfRequest, res: SrfResponse, callback: MediaServer.ConnectCallerCallback): this;
    /**
     * Creates a Conference on the media server.
     * A conference acts as a room where multiple endpoints can be bridged together.
     *
     * @param name - An optional name for the conference. If omitted, a random UUID will be used.
     * @param opts - Options for creating the conference (e.g., flags, profile, maxMembers).
     * @returns A Promise resolving to a Conference instance.
     */
    createConference(name: string, opts?: MediaServer.ConferenceCreateOptions): Promise<Conference>;
    createConference(opts?: MediaServer.ConferenceCreateOptions): Promise<Conference>;
    /**
     * Creates a Conference using a callback.
     *
     * @param name - The conference name.
     * @param opts - Options for the conference.
     * @param callback - The callback invoked with the new Conference instance.
     */
    createConference(name: string, opts: MediaServer.ConferenceCreateOptions, callback: MediaServer.CreateConferenceCallback): this;
    createConference(opts: MediaServer.ConferenceCreateOptions, callback: MediaServer.CreateConferenceCallback): this;
    createConference(name: string, callback: MediaServer.CreateConferenceCallback): this;
    createConference(callback: MediaServer.CreateConferenceCallback): this;
    /**
     * Safely serializes the MediaServer properties to JSON, ignoring circular references.
     * @returns A partial representation of the MediaServer's state.
     */
    toJSON(): Partial<this>;
    private _onError;
    private _onHeartbeat;
    private _onCreateTimeout;
    private _onNewCall;
    private _onConnectionClosed;
}
export = MediaServer;
