import { EslConnection, Srf, SrfDialog, SrfRequest, SrfResponse } from "./types";
import { EventEmitter } from 'events';
import Endpoint from './endpoint';
import Conference from './conference';
import Mrf = require('./mrf');
declare namespace MediaServer {
    interface ConferenceCreateOptions {
        pin?: string;
        profile?: string;
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
        maxMembers?: number;
    }
    interface EndpointOptions {
        remoteSdp?: string;
        codecs?: string[] | string;
        headers?: Record<string, string | boolean>;
        customEvents?: string[];
        is3pcc?: boolean;
        srtp?: boolean;
        family?: 'ipv4' | 'ipv6';
        dtls?: boolean;
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
        'connect': () => void;
        'ready': () => void;
        'error': (err: Error) => void;
        'end': () => void;
        'channel::open': (args: {
            uuid: string;
            countOfConnections: number;
            countOfChannels: number;
        }) => void;
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
declare namespace MediaServer {
    interface Events {
        'connect': () => void;
        'ready': () => void;
        'error': (err: Error) => void;
        'end': () => void;
        'channel::open': (args: {
            uuid: string;
            countOfConnections: number;
            countOfChannels: number;
        }) => void;
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
declare class MediaServer extends EventEmitter {
    private _conn;
    private _mrf;
    private _srf;
    pendingConnections: Map<string, MediaServer.PendingConnection>;
    private _isMediaServerReady;
    maxSessions: number;
    currentSessions: number;
    cps: number;
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
    listenAddress?: string;
    listenPort?: number;
    advertisedAddress?: string;
    advertisedPort?: number;
    private _server?;
    hostname?: string;
    v4address?: string;
    v6address?: string;
    fsVersion?: string;
    cpuIdle?: number;
    constructor(conn: EslConnection, mrf: Mrf, listenAddress: string, listenPort: number, advertisedAddress?: string, advertisedPort?: number, profile?: string);
    get address(): string;
    get conn(): EslConnection;
    get srf(): Srf;
    connected(): boolean;
    disconnect(): void;
    destroy(): void;
    hasCapability(capability: string | string[]): boolean;
    api(command: string): Promise<string>;
    api(command: string, callback: MediaServer.ApiCallback): this;
    createEndpoint(opts?: MediaServer.EndpointOptions): Promise<Endpoint>;
    createEndpoint(opts: MediaServer.EndpointOptions, callback: MediaServer.CreateEndpointCallback): this;
    createEndpoint(callback: MediaServer.CreateEndpointCallback): this;
    connectCaller(req: SrfRequest, res: SrfResponse, opts?: MediaServer.EndpointOptions): Promise<{
        endpoint: Endpoint;
        dialog: SrfDialog;
    }>;
    connectCaller(req: SrfRequest, res: SrfResponse, opts: MediaServer.EndpointOptions, callback: MediaServer.ConnectCallerCallback): this;
    connectCaller(req: SrfRequest, res: SrfResponse, callback: MediaServer.ConnectCallerCallback): this;
    createConference(name: string, opts?: MediaServer.ConferenceCreateOptions): Promise<Conference>;
    createConference(opts?: MediaServer.ConferenceCreateOptions): Promise<Conference>;
    createConference(name: string, opts: MediaServer.ConferenceCreateOptions, callback: MediaServer.CreateConferenceCallback): this;
    createConference(opts: MediaServer.ConferenceCreateOptions, callback: MediaServer.CreateConferenceCallback): this;
    createConference(name: string, callback: MediaServer.CreateConferenceCallback): this;
    createConference(callback: MediaServer.CreateConferenceCallback): this;
    toJSON(): Partial<this>;
    private _onError;
    private _onHeartbeat;
    private _onCreateTimeout;
    private _onNewCall;
    private _onConnectionClosed;
}
export = MediaServer;
