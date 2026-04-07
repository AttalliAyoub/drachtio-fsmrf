import callGenerator from './scripts/call-generator';
import test from 'tape';
import Srf from 'drachtio-srf';
import Mrf from '..';
import config from 'config';
import clearRequire from 'clear-module';
import Endpoint from '../lib/endpoint';
const EP_FILE = '/tmp/endpoint_record.wav';
const EP_FILE2 = '/tmp/endpoint_record2.wav';

// connect the 2 apps to their drachtio servers
const connect = async (agents: any[]) => {
  return Promise.all(agents.map((agent: any) => new Promise<void>((resolve: any, reject: any) => {
    agent.once('connect', (err: any) => {
      if (err) reject(err);
      else resolve();  
    });
  })));
};

// disconnect the 2 apps
function disconnect(agents: any[]) {
  agents.forEach((app: any) => {app.disconnect();}) ;
  clearRequire('./../app');
}


test('MediaServer#connectCaller create active endpoint using Promise', (t: any) => {
  t.timeoutAfter(6000);

  
  const uac = callGenerator(config.get('call-generator'));
  const srf = new Srf();
  const mrf = new Mrf(srf) ;
  let ms: any, ep: any, dlg: any ;

  srf.connect(config.get('drachtio-sut')) ;

  connect([srf, uac])
    .then(() => {
      srf.invite(handler);
      uac.startScenario() ;
      return ;
    })
    .catch((err: any) => {
      t.fail(err);
    });


  function handler(req: any, res: any) {

    mrf.connect(config.get('freeswitch-sut'))
      .then((mediaserver) => {
        t.pass('connected to media server');
        ms = mediaserver ;
        return mediaserver.connectCaller(req, res);
      })
      .then(({endpoint, dialog}: any) => {
        t.ok(endpoint instanceof Endpoint, 'connected incoming call to endpoint');

        ep = endpoint ;
        dlg = dialog ;
        return uac.streamTo(ep.local.sdp);
      })
      .then(() => {
        t.pass('modified uac to stream to endpoint');
        return ep.getChannelVariables();
      })
      .then((vars) => {
        t.ok(vars.variable_rtp_use_codec_string.split(',').indexOf('PCMU') !== -1, 'PCMU is offered');
        t.ok(vars.variable_rtp_use_codec_string.split(',').indexOf('PCMA') !== -1, 'PCMA is offered');
        t.ok(vars.variable_rtp_use_codec_string.split(',').indexOf('OPUS') !== -1, 'OPUS is offered');

        return ep.play({file:'voicemail/8000/vm-record_message.wav', seekOffset: 8000, timeoutSecs: 2});
      })
      .then((vars) => {
        t.ok(vars.playbackSeconds === "2", 'playbackSeconds is correct');
        t.ok(vars.playbackMilliseconds === "2048", 'playbackMilliseconds is correct');
        t.ok(vars.playbackLastOffsetPos === "104000", 'playbackLastOffsetPos is correct');
        
        return ep.play('silence_stream://200');
      })
      .then(() => {
        t.pass('play a single file');
        return ep.play(['silence_stream://150', 'silence_stream://150']);
      })
      .catch((err: any) => {
        console.error(err);
        t.fail(err);
      })
      .then(() => {
        t.pass('play an array of files');
        ep.destroy() ;
        dlg.destroy() ;
        ms.disconnect() ;
        disconnect([srf, uac]);
        t.end() ;
        return;
      })
      .catch ((err: any) => {
        t.fail(err);
        if (ep) ep.destroy() ;
        if (dlg) dlg.destroy() ;
        if (ms) ms.disconnect() ;
        disconnect([srf, uac]);
        t.end() ;
      });
  }
});

test('MediaServer#connectCaller create active endpoint using Callback', (t: any) => {
  t.timeoutAfter(5000);

  
  const uac = callGenerator(config.get('call-generator'));
  const srf = new Srf();
  const mrf = new Mrf(srf) ;
  let ms: any, ep: any, dlg: any ;

  srf.connect(config.get('drachtio-sut')) ;

  connect([srf, uac])
    .then(() => {
      srf.invite(handler);
      uac.startScenario() ;
      return ;
    })
    .catch((err: any) => {
      t.fail(err);
    });

  function handler(req: any, res: any) {

    mrf.connect(config.get('freeswitch-sut'))
      .then((mediaserver) => {
        t.pass('connected to media server');
        return ms = mediaserver ;
      })
      .then(() => {
        return ms.connectCaller(req, res);
      })
      .then(({endpoint, dialog}: any) => {
        ep = endpoint ;
        dlg = dialog ;
        return uac.streamTo(endpoint.local.sdp);
      })
      .then(() => {
        t.pass('modified uac to stream to endpoint');
        return ep.getChannelVariables();
      })
      .then((vars) => {
        t.ok(vars.variable_rtp_use_codec_string.split(',').indexOf('PCMU') !== -1, 'PCMU is offered');
        t.ok(vars.variable_rtp_use_codec_string.split(',').indexOf('PCMA') !== -1, 'PCMA is offered');
        t.ok(vars.variable_rtp_use_codec_string.split(',').indexOf('OPUS') !== -1, 'OPUS is offered');
        ep.destroy() ;
        dlg.destroy() ;
        ms.disconnect() ;
        disconnect([srf, uac]);
        t.end() ;
        return;
      })
      .catch((err: any) => {
        t.fail(err);
      });
  }
});

test('MediaServer#connectCaller add custom event listeners', (t: any) => {
  t.timeoutAfter(5000);

  
  const uac = callGenerator(config.get('call-generator'));
  const srf = new Srf();
  const mrf = new Mrf(srf) ;
  let ms: any, ep: any, dlg: any ;

  srf.connect(config.get('drachtio-sut')) ;

  connect([srf, uac])
    .then(() => {
      srf.invite(handler);
      uac.startScenario() ;
      return ;
    })
    .catch((err: any) => {
      t.fail(err);
    });

  function handler(req: any, res: any) {

    mrf.connect(config.get('freeswitch-sut'))
      .then((mediaserver) => {
        t.pass('connected to media server');
        return ms = mediaserver ;
      })
      .then(() => {
        return ms.connectCaller(req, res);
      })
      .then(({endpoint, dialog}: any) => {
        ep = endpoint ;
        dlg = dialog ;
        return uac.streamTo(endpoint.local.sdp);
      })
      .then(() => {
        t.pass('modified uac to stream to endpoint');
        t.throws(ep.addCustomEventListener.bind(ep, 'example::event'), 'throws if handler is not present');
        t.throws(ep.addCustomEventListener.bind(ep, 'example::event', 'foobar'), 'throws if handler is not a function');
        t.throws(ep.addCustomEventListener.bind(ep, 'CUSTOM example::event'), 'throws if incorrect form of event name used');
        const listener = (args: any) => {};
        ep.addCustomEventListener('example::event', (args: any) => {});
        ep.addCustomEventListener('example::event', listener);
        t.equals(ep._customEvents.length, 1, 'successfully adds custom event listener');
        t.equals(ep.listenerCount('example::event'), 2, 'successfully adds custom event listener');
        ep.removeCustomEventListener('example::event', listener);
        t.equals(ep._customEvents.length, 1, 'successfully removes 1 listener');
        t.equals(ep.listenerCount('example::event'), 1, 'successfully removes 1 listener');
        ep.removeCustomEventListener('example::event');
        t.equals(ep._customEvents.length, 0, 'successfully removes custom event listener');
        return;
      })
      .then(() => {
        ep.destroy() ;
        dlg.destroy() ;
        ms.disconnect() ;
        disconnect([srf, uac]);
        t.end() ;
        return;
      })
      .catch((err: any) => {
        t.fail(err);
      });
  }
});

test('play and collect dtmf', (t: any) => {
  t.timeoutAfter(10000);

  
  const uac = callGenerator(config.get('call-generator'));
  const srf = new Srf();
  const mrf = new Mrf(srf) ;
  let ms: any, ep: any, ep2: any, dlg: any ;
  const digits = '1';

  srf.connect(config.get('drachtio-sut')) ;

  connect([srf, uac])
    .then(() => {
      srf.invite(handler);
      uac.startScenario() ;
      return ;
    })
    .catch((err: any) => {
      t.fail(err);
    });

  function handler(req: any, res: any) {

    mrf.connect(config.get('freeswitch-sut'))
      .then((mediaserver) => {
        t.pass('connected to media server');
        ms = mediaserver ;
        return mediaserver.connectCaller(req, res);
      })
      .then(({endpoint, dialog}: any) => {
        t.ok(endpoint instanceof Endpoint, 'connected incoming call to endpoint');
        ep = endpoint ;
        dlg = dialog ;
        return uac.streamTo(ep.local.sdp);
      })
      .then(() => {
        return ep.recordSession(EP_FILE);
      })
      .then((evt: any) => {
        t.pass('record_session');
        return uac.generateDtmf(digits);
      })
      .then(() => {
        return t.pass(`generating dtmf digits: \'${digits}\'`);
      })
      .then(() => {
        return ep.playCollect({file: 'silence_stream://200', min: 1, max: 4});
      })
      .then((response) => {
        t.ok(response.digits === '1', `detected digits: \'${response.digits}\'`);
        return ;
      })
      .then(() => {
        return ms.createEndpoint({codecs: ['PCMU', 'PCMA', 'OPUS']}) ;
      })
      .then((endpoint) => {
        ep2 = endpoint ;
        t.pass('created second endpoint');
        return ;
      })
      .then(() => {
        return ep.bridge(ep2);
      })
      .then(() => {
        t.pass('bridged endpoint');
        return ep.mute() ;
      })
      .then(() => {
        t.ok(ep.muted, 'muted endpoint');
        return ep.unmute();
      })
      .then(() => {
        t.ok(!ep.muted, 'unmuted endpoint');
        return ep.toggleMute();
      })
      .then(() => {
        t.ok(ep.muted, 'muted endpoint via toggle');
        return ep.toggleMute();
      })
      .then(() => {
        t.ok(!ep.muted, 'unmuted endpoint via toggle');
        return ep.unbridge();
      })
      .then(() => {
        t.pass('unbridged endpoint');
        return ep.set('playback_terminators', '#');
      })
      .then(() => {
        t.pass('set a single value');
        return ep.set({
          'playback_terminators': '*',
          'recording_follow_transfer': true
        });
      })
      .then((evt: any) => {
        t.pass('set multiple values');
        ep.destroy() ;
        ep2.destroy() ;
        dlg.destroy() ;
        ms.disconnect() ;
        disconnect([srf, uac]);
        t.end() ;
        return ;
      })
      .catch((err: any) => {
        console.error(err);
        t.fail(err);
        ep.destroy() ;
        dlg.destroy() ;
        ms.disconnect() ;
        disconnect([srf, uac]);
        t.end() ;
      });
  }
});

test('record', (t: any) => {
  t.timeoutAfter(10000);

  if (process.env.CI === 'travis') {
    t.pass('stubbed out for travis');
    t.end();
    return;
  }


  
  const uac = callGenerator(config.get('call-generator'));
  const srf = new Srf();
  const mrf = new Mrf(srf) ;
  let ms: any, ep: any, dlg: any ;

  srf.connect(config.get('drachtio-sut')) ;

  connect([srf, uac])
    .then(() => {
      srf.invite(handler);
      uac.startScenario() ;
      return ;
    })
    .catch((err: any) => {
      t.fail(err);
    });

  function handler(req: any, res: any) {

    let promiseRecord: any;
    mrf.connect(config.get('freeswitch-sut'))
      .then((mediaserver) => {
        t.pass('connected to media server');
        ms = mediaserver ;
        return mediaserver.connectCaller(req, res);
      })
      .then(({endpoint, dialog}: any) => {
        t.ok(endpoint instanceof Endpoint, 'connected incoming call to endpoint');
        ep = endpoint ;
        dlg = dialog ;
        ep.on('dtmf', (evt: any) => {
          t.pass(`got dtmf: ${JSON.stringify(evt)}`);
        });
        return uac.streamTo(ep.local.sdp);
      })
      .then(() => {
        return ep.set('playback_terminators', '123456789#*');
      })
      .then(() => {
        ep.play(['silence_stream://1000', 'voicemail/8000/vm-record_message.wav']);
        promiseRecord = ep.record(EP_FILE2, {timeLimitSecs: 3});
        t.pass('started recording');
        return uac.generateSilence(2000);
      })
      .then((evt: any) => {
        t.pass('generating dtmf #');
        uac.generateDtmf('#');
        return promiseRecord;
      })
      .then((evt: any) => {
        t.ok(evt.terminatorUsed === '#', `record terminated by # key: ${JSON.stringify(evt)}`);
        return;
      })
      .then(() => {
        ep.destroy() ;
        dlg.destroy() ;
        ms.disconnect() ;
        disconnect([srf, uac]);
        t.end() ;
        return ;
      })
      .catch((err: any) => {
        console.error(err);
        t.fail(err);
        ep.destroy() ;
        dlg.destroy() ;
        ms.disconnect() ;
        disconnect([srf, uac]);
        t.end() ;
      });
  }
});

test.skip('fork audio', (t: any) => {
  t.timeoutAfter(15000);

  if (process.env.CI === 'travis') {
    t.pass('stubbed out for travis');
    t.end();
    return;
  }

  
  const uac = callGenerator(config.get('call-generator'));
  const srf = new Srf();
  const mrf = new Mrf(srf) ;
  let ms: any, ep: any, dlg: any ;

  srf.connect(config.get('drachtio-sut')) ;

  connect([srf, uac])
    .then(() => {
      srf.invite(handler);
      uac.startScenario() ;
      return ;
    })
    .catch((err: any) => {
      t.fail(err);
    });

  function handler(req: any, res: any) {

    let promisePlayFile: any;
    mrf.connect(config.get('freeswitch-sut'))
      .then((mediaserver) => {
        t.pass('connected to media server');
        ms = mediaserver ;
        return mediaserver.connectCaller(req, res, {codecs: 'PCMU'});
      })
      .then(({endpoint, dialog}: any) => {
        t.ok(endpoint instanceof Endpoint, 'connected incoming call to endpoint');
        ep = endpoint ;
        dlg = dialog ;
        return uac.streamTo(ep.local.sdp);
      })
      .then(() => {
        return ep.forkAudioStart({
          wsUrl: 'ws://ws-server:3001',
          mixType: 'stereo',
          sampling: '16000',
          metadata: {foo: 'bar'},
          bidirectionalAudioSampleRate: 8000
        });
      })
      .then(() => {
        t.pass('started forking audio with metadata');
        return uac.playFile('voicemail/16000/vm-record_message.wav');
      })
      .then((evt: any) => {
        return ep.forkAudioSendText('simple text');
      })
      .then(() => {
        t.pass('sent text frame ');
        return ep.forkAudioSendText({bar: 'baz'});
      })
      .then(() => {
        t.pass('sent text frame (json) ');
        return ep.forkAudioStop({foo: 'baz'});
      })
      .then(() => {
        t.pass('stopped forking audio with metadata');
        return ep.forkAudioStart({
          wsUrl: 'ws://ws-server:3001',
          mixType: 'stereo',
          sampling: '16000'
        });
      })
      .then(() => {
        t.pass('started forking audio with no metadata');
        return uac.playFile('voicemail/16000/vm-record_message.wav');
      })
      .then((evt: any) => {
        return ep.forkAudioStop();
      })
      // pause, resume
      .then(() => {
         t.pass('stopped forking audio with no metadata');
        return ep.forkAudioStart({
          wsUrl: 'ws://ws-server:3001',
          mixType: 'stereo',
          sampling: '16000'
        });
      })
      .then(() => {
        t.pass('started forking audio with no metadata');
        return uac.playFile('voicemail/16000/vm-record_message.wav');
      })
       .then((evt: any) => {
        return ep.forkAudioPause('background_record', true);
      })
       .then((evt: any) => {
        return ep.forkAudioResume();
      })
      .then((evt: any) => {
        return ep.forkAudioStop();
      })
      .then(() => {
        t.pass('stopped forking audio with no metadata');
        return ;
      })
      .then(() => {
        ep.destroy() ;
        dlg.destroy() ;
        ms.disconnect() ;
        disconnect([srf, uac]);
        t.end() ;
        return ;
      })
      .catch((err: any) => {
        console.error(err);
        t.fail(err);
        ep.destroy() ;
        dlg.destroy() ;
        ms.disconnect() ;
        disconnect([srf, uac]);
        t.end() ;
      });
  }
});