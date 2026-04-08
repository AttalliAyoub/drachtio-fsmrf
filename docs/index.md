# drachtio-fsmrf Documentation

Welcome to the official documentation for the `drachtio-fsmrf` package. This framework provides a powerful, high-level **Media Resource Function (MRF)** designed to integrate FreeSWITCH seamlessly with your Node.js applications built upon [drachtio-srf](https://github.com/davehorton/drachtio-srf).

This framework allows developers to write feature-rich Interactive Voice Response (IVR) menus, bridged calls, multi-party conferencing, real-time audio forking for transcription, and media playback utilizing a clean, asynchronous API.

## Structure

The documentation is organized into two primary categories to best fit your needs.

### High-Level Architecture

If you are new to the `drachtio` ecosystem or FreeSWITCH, start here to understand the high-level flow of the application and the interaction between signaling and media streams.

- [Architecture Overview](./architecture/overview.md) - Understand the mechanics, 3PCC negotiation, and Event Socket integration.

### API Reference

Explore the detailed capabilities of individual classes, methods, and configurations used throughout the framework.

- [**MRF (Media Resource Function)**](./api/mrf.md) - The main entry point to initiate connections to a FreeSWITCH server.
- [**MediaServer**](./api/mediaserver.md) - Represents an active FreeSWITCH Event Socket connection, allowing endpoint/conference instantiation and dialplan API execution.
- [**Endpoint**](./api/endpoint.md) - Represents an active SIP media leg. Enables operations like media playback, DTMF collection, bridging, and audio forking.
- [**Conference**](./api/conference.md) - Manage multi-party conference rooms, broadcast media globally, record sessions, and handle participant states.
- [**Types and Interfaces**](./api/types.md) - Descriptions of foundational SRF and FreeSWITCH ESL types, states, and callback signatures.
- [**Utilities**](./api/utils.md) - Helper methods for tasks such as prioritizing SDP codecs, parsing Event Socket bodies, and decibel conversions.

---

## Quick Start Example

This quick snippet demonstrates creating an MRF and connecting an incoming call to a FreeSWITCH IVR:

```javascript
const Srf = require('drachtio-srf');
const Mrf = require('drachtio-fsmrf');

const srf = new Srf();
const mrf = new Mrf(srf);

srf.connect({ host: '127.0.0.1', port: 9022, secret: 'cymru' });

mrf.connect({
  address: '127.0.0.1',
  port: 8021,
  secret: 'ClueCon'
}).then((mediaserver) => {
  console.log('Connected to Media Server!');

  srf.invite((req, res) => {
    mediaserver.connectCaller(req, res).then(({ endpoint, dialog }) => {
      // Caller is connected. Play a prompt and collect digits.
      return endpoint.playCollect({
        file: 'ivr/8000/ivr-please_enter_pin_followed_by_pound.wav',
        min: 4,
        max: 8,
        terminators: '#'
      });
    }).then((result) => {
      console.log(`User entered PIN: ${result.digits}`);
    }).catch((err) => {
      console.error('Call failed:', err);
    });
  });
});
```

Happy coding!
