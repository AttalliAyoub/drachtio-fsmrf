# Architecture Overview

The `drachtio-fsmrf` package provides a Media Resource Function (MRF) abstraction designed to work seamlessly with the [drachtio](https://drachtio.org/) ecosystem. It enables developers to easily build feature-rich SIP, VoIP, and WebRTC applications in Node.js by delegating media-heavy operations to a FreeSWITCH server.

## High-Level Architecture

The system is composed of several decoupled layers that work together to handle signaling and media streams separately.

1. **Application Layer (Node.js)**
   Your custom business logic (e.g., routing calls, fetching customer data, determining IVR menus).

2. **Signaling Resource Function (SRF)**
   The `drachtio-srf` framework handles SIP signaling (INVITE, BYE, ACK, etc.). It communicates with the Drachtio SIP Server over a TCP/WebSocket connection.

3. **Media Resource Function (MRF)**
   The `drachtio-fsmrf` package acts as a bridge to FreeSWITCH. It issues commands to instruct FreeSWITCH to play media, record audio, collect DTMF digits, or mix audio for conferences.

4. **Media Server (FreeSWITCH)**
   The actual heavy-lifting media processing engine. It terminates RTP streams, handles DTLS/SRTP encryption, mixes audio, and performs Voice Activity Detection (VAD).

---

## Interaction Between Drachtio and FreeSWITCH

When a SIP INVITE arrives at your Node.js application (via `drachtio-srf`), the application must decide whether to act as a proxy or whether it needs to interact with the media stream (e.g., to play an IVR greeting).

If media interaction is required, `drachtio-fsmrf` steps in:

1. **Third-Party Call Control (3PCC)**
   `drachtio-fsmrf` uses the FreeSWITCH Event Socket Library (ESL) to command FreeSWITCH to generate a local SIP session (an `Endpoint`).
   
2. **SDP Negotiation**
   FreeSWITCH generates a local SDP (Session Description Protocol) offer. The Node.js application takes this SDP and sends it back to the original caller in a `200 OK` SIP response.

3. **Event Socket Connections**
   FreeSWITCH connects back to `drachtio-fsmrf` using an Outbound Event Socket connection. This establishes a persistent control channel tied specifically to that call's UUID.
   
4. **Media Operations**
   Once the call is established (`State.CONNECTED`), the Node.js application issues high-level commands like `endpoint.play()` or `endpoint.playCollect()`. These are translated into low-level FreeSWITCH dialplan execution commands (`playback`, `play_and_get_digits`, etc.).

---

## The Outbound Event Socket Server

A key component of `drachtio-fsmrf` is its hybrid use of FreeSWITCH's Event Socket interface.

- **Inbound Event Socket:** When you call `mrf.connect()`, the framework connects *to* FreeSWITCH's Event Socket listener (typically port `8021`). This connection is used to issue global commands (like `status`, creating endpoints, or managing conferences).
- **Outbound Event Socket:** Behind the scenes, `MediaServer` spins up a local TCP server in Node.js (via `esl.Server`). Whenever an endpoint is created, FreeSWITCH is instructed to connect *back* to this Node.js server. This dedicated socket connection receives real-time events specific to that channel (DTMF, call state changes, hang-ups) without overwhelming the main inbound connection.

This design ensures high performance, separation of concerns, and accurate real-time event streaming for thousands of concurrent calls.
