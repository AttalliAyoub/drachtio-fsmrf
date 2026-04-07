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
        [key: string]: any;
    }
    type CreateEndpointCallback = (err: Error | null, endpoint?: Endpoint) => void;
    type CreateConferenceCallback = (err: Error | null, conference?: Conference) => void;
    type ApiCallback = (response: string) => void;
    type ConnectCallerCallback = (err: Error | null, result?: {
        endpoint?: Endpoint;
        dialog?: any;
    }) => void;
}
declare class MediaServer extends EventEmitter {
    private _conn;
    private _mrf;
    private _srf;
    pendingConnections: Map<string, any>;
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
    constructor(conn: any, mrf: Mrf, listenAddress: string, listenPort: number, advertisedAddress?: string, advertisedPort?: number, profile?: string);
    get address(): string;
    get conn(): any;
    get srf(): any;
    connected(): any;
    disconnect(): void;
    destroy(): void;
    hasCapability(capability: string | string[]): boolean;
    api(command: string): Promise<string>;
    api(command: string, callback: MediaServer.ApiCallback): this;
    createEndpoint(opts?: MediaServer.EndpointOptions): Promise<Endpoint>;
    createEndpoint(opts: MediaServer.EndpointOptions, callback: MediaServer.CreateEndpointCallback): this;
    createEndpoint(callback: MediaServer.CreateEndpointCallback): this;
    connectCaller(req: any, res: any, opts?: MediaServer.EndpointOptions): Promise<{
        endpoint: Endpoint;
        dialog: any;
    }>;
    connectCaller(req: any, res: any, opts: MediaServer.EndpointOptions, callback: MediaServer.ConnectCallerCallback): this;
    connectCaller(req: any, res: any, callback: MediaServer.ConnectCallerCallback): this;
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
