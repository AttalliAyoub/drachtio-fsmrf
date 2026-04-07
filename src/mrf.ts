import esl from 'drachtio-modesl';
import assert from 'assert';
import MediaServer from './mediaserver';
import { EventEmitter } from 'events';
import os from 'os';
import { parseBodyText } from './utils';
import createDebug from 'debug';

const debug = createDebug('drachtio:fsmrf');

namespace Mrf {
  export interface CreateOptions {
    debugDir?: string;
    sendonly?: boolean;
    customEvents?: string[];
  }

  export interface ConnectOptions {
    address: string;
    port?: number;
    secret?: string;
    listenAddress?: string;
    listenPort?: number;
    advertisedAddress?: string;
    advertisedPort?: number;
    profile?: string;
  }

  export type ConnectCallback = (err: Error | null, ms?: MediaServer) => void;
}

class Mrf extends EventEmitter {
  private _srf: any;
  public debugDir?: string;
  public debugSendonly?: boolean;
  public localAddresses: string[];
  public customEvents: string[];

  public static utils = { parseBodyText };

  constructor(srf: any, opts?: Mrf.CreateOptions) {
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

  get srf() {
    return this._srf;
  }

  connect(opts: Mrf.ConnectOptions): Promise<MediaServer>;
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