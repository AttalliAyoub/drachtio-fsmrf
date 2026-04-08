import { Srf } from "./types";
import Endpoint from './endpoint';
import Conference from './conference';
import MediaServer from './mediaserver';
import { EventEmitter } from 'events';
declare namespace Mrf {
    type Endpoint = import('./endpoint');
    type MediaServer = import('./mediaserver');
    type Conference = import('./conference');
    /**
     * Options for creating an MRF instance.
     */
    interface CreateOptions {
        /** Directory to write debug SIP captures to. */
        debugDir?: string;
        /** If true, sendonly SDP will be generated for debug purposes. */
        sendonly?: boolean;
        /** Array of custom FreeSWITCH events to subscribe to. */
        customEvents?: string[];
    }
    /**
     * Options for connecting to a FreeSWITCH media server.
     */
    interface ConnectOptions {
        /** The IP address or hostname of the FreeSWITCH Event Socket listener. */
        address: string;
        /** The Event Socket listener port (default: 8021). */
        port?: number;
        /** The Event Socket password (default: 'ClueCon'). */
        secret?: string;
        /** Local IP address to listen on for inbound connections from FreeSWITCH (default: auto-detected). */
        listenAddress?: string;
        /** Local port to listen on for inbound connections (default: 0 for random). */
        listenPort?: number;
        /** Advertised IP address for the Event Socket outbound server (useful behind NAT). */
        advertisedAddress?: string;
        /** Advertised port for the Event Socket outbound server. */
        advertisedPort?: number;
        /** The FreeSWITCH SIP profile to use (default: 'drachtio_mrf'). */
        profile?: string;
    }
    /**
     * Callback signature for connecting to a media server.
     */
    type ConnectCallback = (err: Error | null, ms?: MediaServer) => void;
}
/**
 * Creates an instance of the MRF (Media Resource Function) manager.
 * This class coordinates with the drachtio-srf framework and manages
 * connections to one or more FreeSWITCH media servers.
 *
 * @example
 * ```typescript
 * import Srf from 'drachtio-srf';
 * import Mrf from 'drachtio-fsmrf';
 *
 * const srf = new Srf();
 * srf.connect({ host: '127.0.0.1', port: 9022, secret: 'cymru' });
 *
 * const mrf = new Mrf(srf);
 *
 * mrf.connect({
 *   address: '127.0.0.1',
 *   port: 8021,
 *   secret: 'ClueCon'
 * }).then((mediaserver) => {
 *   console.log('successfully connected to media server');
 * });
 * ```
 */
declare class Mrf extends EventEmitter {
    /** The Endpoint class exported for convenience. */
    static Endpoint: typeof Endpoint;
    /** The MediaServer class exported for convenience. */
    static MediaServer: typeof MediaServer;
    /** The Conference class exported for convenience. */
    static Conference: typeof Conference;
    private _srf;
    /** Directory used for debugging. */
    debugDir?: string;
    /** Flag to indicate if sendonly mode is enabled for debugging. */
    debugSendonly?: boolean;
    /** List of automatically detected local IPv4 addresses. */
    localAddresses: string[];
    /** Array of custom events configured to be monitored. */
    customEvents: string[];
    /** Utility methods exposed by the MRF framework. */
    static utils: {
        parseBodyText: (txt: string) => Record<string, string | number>;
    };
    /**
     * Initializes a new Mrf instance.
     *
     * @param srf - The drachtio-srf instance
     * @param opts - Configuration options for the MRF
     */
    constructor(srf: Srf, opts?: Mrf.CreateOptions);
    /**
     * Returns the underlying drachtio-srf instance.
     */
    get srf(): Srf;
    /**
     * Connects to a FreeSWITCH media server using the provided options.
     * Can be used with async/await (Promise) or with a callback.
     *
     * @param opts - The connection options for the FreeSWITCH Event Socket
     * @returns A Promise resolving to a MediaServer instance
     *
     * @example
     * ```typescript
     * const ms = await mrf.connect({
     *   address: '10.10.100.1',
     *   port: 8021,
     *   secret: 'ClueCon'
     * });
     * console.log('Media server is ready!');
     * ```
     */
    connect(opts: Mrf.ConnectOptions): Promise<MediaServer>;
    /**
     * Connects to a FreeSWITCH media server using the provided options.
     *
     * @param opts - The connection options for the FreeSWITCH Event Socket
     * @param callback - The callback invoked when connection succeeds or fails
     * @returns The Mrf instance for chaining
     */
    connect(opts: Mrf.ConnectOptions, callback: Mrf.ConnectCallback): this;
}
export = Mrf;
