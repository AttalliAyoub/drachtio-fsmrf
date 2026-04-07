import test from 'tape';
import Srf from 'drachtio-srf';
import Mrf from '..';
import config from 'config';
import clearRequire from 'clear-module';
import MediaServer from '../lib/mediaserver';
import createDebug from 'debug';
const debug = createDebug('drachtio:fsmrf');

// connect the 2 apps to their drachtio servers
function connect(agents: any[]) {
  return Promise.all(agents.map((agent: any) => new Promise<void>((resolve: any, reject: any) => {
    agent.once('connect', (err: any) => {
      if (err) reject(err);
      else resolve();  
    });
  })));
}

// disconnect the 2 apps
function disconnect(agents: any[]) {
  agents.forEach((app: any) => {app.disconnect();}) ;
  clearRequire('./../app');
}

test.skip('Mrf#connect using Promise', (t: any) => {
  t.timeoutAfter(5000);

  const srf = new Srf();
  srf.connect(config.get('drachtio-uac')) ;
  const mrf = new Mrf(srf) ;

  connect([srf])
    .then(() => {
      t.ok(mrf.localAddresses.constructor.name === 'Array', 'mrf.localAddresses is an array');

      return mrf.connect(config.get('freeswitch-uac'));
    })
    .then((mediaserver) => {
      t.ok(mediaserver.conn.socket.constructor.name === 'Socket', 'socket connected');
      t.ok(mediaserver.srf instanceof Srf, 'mediaserver.srf is an Srf');
      t.ok(mediaserver instanceof MediaServer,
        `successfully connected to mediaserver at ${mediaserver.sip.ipv4.udp.address}`);
      t.ok(mediaserver.hasCapability(['ipv4', 'udp']), 'mediaserver has ipv4 udp');
      t.ok(mediaserver.hasCapability(['ipv4', 'dtls']), 'mediaserver has ipv4 dtls');
      t.ok(!mediaserver.hasCapability(['ipv6', 'udp']), 'mediaserver does not have ipv6 udp');
      t.ok(!mediaserver.hasCapability(['ipv6', 'dtls']), 'mediaserver does not have ipv6 dtls');
      mediaserver.disconnect() ;
      t.ok(mediaserver.conn.socket === null, 'Mrf#disconnect closes socket');
      disconnect([srf]);
      t.end() ;
      return;
    })
    .catch((err: any) => {
      t.fail(err);
    });
}) ;

test.skip('Mrf#connect rejects Promise with error when attempting connection to non-listening port', (t: any) => {
  t.timeoutAfter(5000);

  const srf = new Srf();
  srf.connect(config.get('drachtio-uac')) ;
  const mrf = new Mrf(srf) ;

  connect([srf])
    .then(() => {
      return mrf.connect(config.get('freeswitch-uac-fail'));
    })
    .then((mediaserver) => {
      return t.fail('should not have succeeded');
    })
    .catch((err: any) => {
      t.ok(err.code === 'ECONNREFUSED', 'Promise rejects with connection refused error');
      disconnect([srf]);
      t.end() ;
    });
}) ;

test.skip('Mrf#connect using callback', (t: any) => {
  t.timeoutAfter(5000);

  const srf = new Srf();
  srf.connect(config.get('drachtio-uac')) ;
  const mrf = new Mrf(srf) ;

  connect([srf])
    .then(() => {
      t.ok(mrf.localAddresses.constructor.name === 'Array', 'mrf.localAddresses is an array');

      return mrf.connect(config.get('freeswitch-uac'), (err: any, mediaserver: any) => {
        if (err) return t.fail(err);

        t.ok(mediaserver!.conn.socket.constructor.name === 'Socket', 'socket connected');
        t.ok(mediaserver!.srf instanceof Srf, 'mediaserver.srf is an Srf');
        t.ok(mediaserver instanceof MediaServer,
          `successfully connected to mediaserver at ${mediaserver.sip.ipv4.udp.address}`);
        t.ok(mediaserver.hasCapability(['ipv4', 'udp']), 'mediaserver has ipv4 udp');
        t.ok(mediaserver.hasCapability(['ipv4', 'dtls']), 'mediaserver has ipv4 dtls');
        t.ok(!mediaserver.hasCapability(['ipv6', 'udp']), 'mediaserver does not have ipv6 udp');
        t.ok(!mediaserver.hasCapability(['ipv6', 'dtls']), 'mediaserver does not have ipv6 dtls');
        disconnect([srf]);
        mediaserver.disconnect() ;
        t.ok(mediaserver.conn.socket === null, 'Mrf#disconnect closes socket');
        t.end() ;
      });
    })
    .catch((err: any) => {
      t.fail(err);
    });
}) ;
/*
test('Mrf#connect callback returns error when attempting connection to non-listening port', (t: any) => {
  t.timeoutAfter(1000);

  const srf = new Srf();
  srf.connect(config.get('drachtio-uac')) ;
  const mrf = new Mrf(srf) ;

  connect([srf])
    .then(() => {
      return mrf.connect(config.get('freeswitch-uac-fail'), (err: any) => {
        t.ok(err.code === 'ECONNREFUSED', 'callback with err connection refused');
        disconnect([srf]);
        t.end();
      }) ;
    })
    .catch((err: any) => {
      t.fail(err);
    });
}) ;
*/

/* Sending custom-profile Mrf setup */

test('Mrf# - custom-profile - connect using Promise', (t: any) => {
  t.timeoutAfter(5000);

  const srf = new Srf();
  srf.connect(config.get('drachtio-uac')) ;
  const mrf = new Mrf(srf) ;


  connect([srf])
    .then(() => {
      t.ok(mrf.localAddresses.constructor.name === 'Array', 'mrf.localAddresses is an array');

      return mrf.connect(config.get('freeswitch-custom-profile-uac'), (err: any, mediaserver: any) => {
        if (err) return t.fail(err);

        t.ok(mediaserver!.conn.socket.constructor.name === 'Socket', 'socket connected');
        t.ok(mediaserver!.srf instanceof Srf, 'mediaserver.srf is an Srf');
        t.ok(mediaserver instanceof MediaServer,
          `successfully connected to mediaserver at ${mediaserver.sip.ipv4.udp.address}`);
        t.ok(mediaserver.hasCapability(['ipv4', 'udp']), 'mediaserver has ipv4 udp');
        t.ok(mediaserver.hasCapability(['ipv4', 'dtls']), 'mediaserver has ipv4 dtls');
        t.ok(!mediaserver.hasCapability(['ipv6', 'udp']), 'mediaserver does not have ipv6 udp');
        t.ok(!mediaserver.hasCapability(['ipv6', 'dtls']), 'mediaserver does not have ipv6 dtls');
        disconnect([srf]);
        mediaserver.disconnect() ;
        t.ok(mediaserver.conn.socket === null, 'Mrf#disconnect closes socket');
        t.end() ;
      });
    })
    .catch((err: any) => {
      t.fail(err);
    });
}) ;

test('Mrf# - custom-profile - connect using callback', (t: any) => {
  t.timeoutAfter(5000);

  const srf = new Srf();
  srf.connect(config.get('drachtio-uac')) ;
  const mrf = new Mrf(srf) ;


  connect([srf])
    .then(() => {
      t.ok(mrf.localAddresses.constructor.name === 'Array', 'mrf.localAddresses is an array');

      return mrf.connect(config.get('freeswitch-custom-profile-uac'), (err: any, mediaserver: any) => {
        if (err) return t.fail(err);

        t.ok(mediaserver!.conn.socket.constructor.name === 'Socket', 'socket connected');
        t.ok(mediaserver!.srf instanceof Srf, 'mediaserver.srf is an Srf');
        t.ok(mediaserver instanceof MediaServer,
          `successfully connected to mediaserver at ${mediaserver.sip.ipv4.udp.address}`);
        t.ok(mediaserver.hasCapability(['ipv4', 'udp']), 'mediaserver has ipv4 udp');
        t.ok(mediaserver.hasCapability(['ipv4', 'dtls']), 'mediaserver has ipv4 dtls');
        t.ok(!mediaserver.hasCapability(['ipv6', 'udp']), 'mediaserver does not have ipv6 udp');
        t.ok(!mediaserver.hasCapability(['ipv6', 'dtls']), 'mediaserver does not have ipv6 dtls');
        disconnect([srf]);
        mediaserver.disconnect() ;
        t.ok(mediaserver.conn.socket === null, 'Mrf#disconnect closes socket');
        t.end() ;
      });
    })
    .catch((err: any) => {
      t.fail(err);
    });
}) ;
