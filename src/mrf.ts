import { EslConnection, EslEvent, EslServer, Srf, SrfDialog, SrfRequest, SrfResponse } from "./types";
import Endpoint from './endpoint';
import Conference from './conference';
import esl from 'drachtio-modesl';
import assert from 'assert';
import MediaServer from './mediaserver';
import { EventEmitter } from 'events';
import os from 'os';
import { parseBodyText } from './utils';
import createDebug from 'debug';

const debug = createDebug('drachtio:fsmrf');

namespace Mrf {
  export type Endpoint = import('./endpoint');
  export type MediaServer = import('./mediaserver');
  export type Conference = import('./conference');

  /**
   * Options for creating an MRF instance.
   */
  export interface CreateOptions {
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
  export interface ConnectOptions {
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
  export type ConnectCallback = (err: Error | null, ms?: MediaServer) => void;
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
class Mrf extends EventEmitter {
  /** The Endpoint class exported for convenience. */
  static Endpoint = Endpoint;
  /** The MediaServer class exported for convenience. */
  static MediaServer = MediaServer;
  /** The Conference class exported for convenience. */
  static Conference = Conference;
  
  private _srf: Srf;

  /** Directory used for debugging. */
  public debugDir?: string;
  /** Flag to indicate if sendonly mode is enabled for debugging. */
  public debugSendonly?: boolean;
  /** List of automatically detected local IPv4 addresses. */
  public localAddresses: string[];
  /** Array of custom events configured to be monitored. */
  public customEvents: string[];

  /** Utility methods exposed by the MRF framework. */
  public static utils = { parseBodyText };

  /**
   * Initializes a new Mrf instance.
   * 
   * @param srf - The drachtio-srf instance
   * @param opts - Configuration options for the MRF
   */
  constructor(srf: Srf, opts?: Mrf.CreateOptions) {
    super();

    opts = opts || {};

    this._srf = srf;
    this.debugDir = opts.debugDir;
    this.debugSendonly = opts.sendonly;
    this.localAddresses = [];
    this.customEvents = opts.customEvents || [];

    const interfaces = os.networkInterfaces();
    for (const k in interfaces) {
      if (interfaces.hasOwnProperty(k)) {
        for (const k2 in interfaces[k]) {
          const address = interfaces[k]![k2 as any] as os.NetworkInterfaceInfo;
          if (address.family === 'IPv4' && !address.internal) {
            this.localAddresses.push(address.address);
          }
        }
      }
    }
  }

  /**
   * Returns the underlying drachtio-srf instance.
   */
  get srf() {
    return this._srf;
  }

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
  connect(opts: Mrf.ConnectOptions, callback?: Mrf.ConnectCallback): Promise<MediaServer> | this {
    assert.strictEqual(typeof opts, 'object', "argument 'opts' must be provided with connection options");
    assert.strictEqual(typeof opts.address, 'string', "argument 'opts.address' containing media server address is required");

    const address = opts.address;
    const port = opts.port || 8021;
    const secret = opts.secret || 'ClueCon';
    const listenPort = opts.listenPort || 0; // 0 means any available port
    const listenAddress = opts.listenAddress || this.localAddresses[0] || '0.0.0.0';
    const profile = opts.profile || 'drachtio_mrf';

    const _onError = (cb: Mrf.ConnectCallback, err: Error) => {
      cb(err);
    };

    const __x = (cb: Mrf.ConnectCallback) => {
      const listener = _onError.bind(this, cb);
      debug(`Mrf#connect - connecting to ${address}:${port} with secret: ${secret}`);
      
      const conn = new esl.Connection(address, port, secret, () => {
        debug('initial connection made');
        conn.removeListener('error', listener);

        const ms = new MediaServer(
          conn,
          this,
          listenAddress,
          listenPort,
          opts.advertisedAddress,
          opts.advertisedPort,
          profile
        );

        ms.once('ready', () => {
          debug('Mrf#connect - media server is ready for action!');
          cb(null, ms);
        });
        ms.once('error', (err: Error) => {
          debug(`Mrf#connect - error event emitted from media server: ${err}`);
          cb(err);
        });
      });

      conn.on('error', listener);
      conn.on('esl::event::raw::text/rude-rejection', _onError.bind(this, cb, new Error('acl-error')));
    };

    if (callback) {
      __x(callback);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err: Error | null, mediaserver?: MediaServer) => {
        if (err) return reject(err);
        resolve(mediaserver as MediaServer);
      });
    });
  }
}

export = Mrf;