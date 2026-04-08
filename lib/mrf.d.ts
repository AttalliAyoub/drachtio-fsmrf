import { Srf } from "./types";
import Endpoint from './endpoint';
import Conference from './conference';
import MediaServer from './mediaserver';
import { EventEmitter } from 'events';
declare namespace Mrf {
    type Endpoint = import('./endpoint');
    type MediaServer = import('./mediaserver');
    type Conference = import('./conference');
    interface CreateOptions {
        debugDir?: string;
        sendonly?: boolean;
        customEvents?: string[];
    }
    interface ConnectOptions {
        address: string;
        port?: number;
        secret?: string;
        listenAddress?: string;
        listenPort?: number;
        advertisedAddress?: string;
        advertisedPort?: number;
        profile?: string;
    }
    type ConnectCallback = (err: Error | null, ms?: MediaServer) => void;
}
declare class Mrf extends EventEmitter {
    static Endpoint: typeof Endpoint;
    static MediaServer: typeof MediaServer;
    static Conference: typeof Conference;
    private _srf;
    debugDir?: string;
    debugSendonly?: boolean;
    localAddresses: string[];
    customEvents: string[];
    static utils: {
        parseBodyText: (txt: string) => Record<string, string | number>;
    };
    constructor(srf: Srf, opts?: Mrf.CreateOptions);
    get srf(): Srf;
    connect(opts: Mrf.ConnectOptions): Promise<MediaServer>;
    connect(opts: Mrf.ConnectOptions, callback: Mrf.ConnectCallback): this;
}
export = Mrf;
