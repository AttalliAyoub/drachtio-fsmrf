import Srf from 'drachtio-srf';
import Mrf = require('../..');
import assert from 'assert';

export = function(opts: any) {
  const srf: any = new Srf();
  srf.connect(opts.drachtio);

  let ep: any, ms: any;

  srf.startScenario = function() {
    const mrf = new Mrf(srf);

    mrf.connect(opts.freeswitch)
      .then((mediaserver) => {
        ms = mediaserver;
        return mediaserver.createEndpoint();
      })
      .then((endpoint) => {
        ep = endpoint;
        return srf.createUAC(opts.uri, {
          localSdp: endpoint.local.sdp
        });
      })
      .catch((err) => {
        assert.fail(`call-generator: error connecting to media server at ${JSON.stringify(opts.freeswitch)}: ${err}`);
      });
  };

  srf.streamTo = function(remoteSdp: string) {
    return ep.dialog.modify(remoteSdp);
  };

  srf.generateSilence = function(duration: number) {
    return ep.play(`silence_stream://${duration}`)
      .then((evt: any) => evt)
      .catch((err: any) => console.log(`error: ${err}`));
  };

  srf.playFile = function(file: string) {
    return ep.play(file)
      .catch((err: any) => console.log(`error: ${err}`));
  };

  srf.generateDtmf = function(digits: string) {
    ep.execute('send_dtmf', `${digits}@125`)
      .then(() => { return; })
      .catch((err: any) => {
        console.log(`error generating dtmf: ${JSON.stringify(err)}`);
      });
  };

  const origDisconnect = srf.disconnect.bind(srf);
  srf.disconnect = function() {
    if (ep) ep.destroy();
    if (ms) ms.disconnect();
    origDisconnect();
  };

  return srf;
};
