"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pick = exports.modifySdpCodecOrder = exports.sortFunctor = exports.parseBodyText = exports.parseDecibels = void 0;
const transform = __importStar(require("sdp-transform"));
const assert_1 = __importDefault(require("assert"));
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('drachtio:fsmrf');
/**
 * Parses a decibel value from a string or number into a raw integer.
 *
 * @param db - The input value to parse (e.g. `10`, `"+10 dB"`, `"-5db"`).
 * @returns The parsed integer value. Returns 0 if parsing fails.
 *
 * @example
 * ```typescript
 * const gain = parseDecibels("+5 dB"); // Returns 5
 * const reduction = parseDecibels("-10db"); // Returns -10
 * ```
 */
const parseDecibels = (db) => {
    if (!db)
        return 0;
    if (typeof db === 'number') {
        return db;
    }
    else if (typeof db === 'string') {
        const match = db.match(/([+-]?\d+(\.\d+)?)\s*db/i);
        if (match) {
            return Math.trunc(parseFloat(match[1]));
        }
        else {
            return 0;
        }
    }
    else {
        return 0;
    }
};
exports.parseDecibels = parseDecibels;
/**
 * Parses a colon-separated text body into a JavaScript object.
 * Keys starting with `variable_rtp_audio`, `variable_rtp_video`, or `variable_playback`
 * will have their values automatically parsed into integers.
 *
 * @param txt - The raw text body containing key-value pairs separated by colons and newlines.
 * @returns An object containing the parsed key-value pairs.
 */
const parseBodyText = (txt) => {
    return txt.split('\n').reduce((obj, line) => {
        const data = line.split(': ');
        const key = data.shift();
        if (!key)
            return obj;
        const value = decodeURIComponent(data.shift() || '');
        if (key.indexOf('variable_rtp_audio') === 0 ||
            key.indexOf('variable_rtp_video') === 0 ||
            key.indexOf('variable_playback') === 0) {
            obj[key] = parseInt(value, 10);
        }
        else if (key && key.length > 0) {
            obj[key] = value;
        }
        return obj;
    }, {});
};
exports.parseBodyText = parseBodyText;
/**
 * Generates a sorting function used to prioritize media payloads based on a preferred codec list.
 *
 * @param codecs - Array of preferred codec names in order of priority.
 * @param rtp - Array of RTP mapping objects from the parsed SDP.
 * @returns A sorting function to be used with Array.prototype.sort().
 */
const sortFunctor = (codecs, rtp) => {
    const DEFAULT_SORT_ORDER = 999;
    const rtpMap = new Map();
    rtpMap.set(0, 'PCMU');
    rtpMap.set(8, 'PCMA');
    rtpMap.set(18, 'G.729');
    rtpMap.set(18, 'G729');
    rtp.forEach((r) => {
        if (r.codec && r.payload !== undefined) {
            const name = r.codec.toUpperCase();
            if (name !== 'TELEPHONE-EVENT')
                rtpMap.set(r.payload, name);
        }
    });
    function score(pt) {
        const n = typeof pt === 'string' ? parseInt(pt, 10) : pt;
        if (!rtpMap.has(n)) {
            return DEFAULT_SORT_ORDER;
        }
        const name = rtpMap.get(n);
        if (name && codecs.includes(name)) {
            return codecs.indexOf(name);
        }
        return DEFAULT_SORT_ORDER;
    }
    return function (a, b) {
        return score(a) - score(b);
    };
};
exports.sortFunctor = sortFunctor;
/**
 * Modifies an SDP string by reordering the codec payloads to prioritize the requested codecs.
 *
 * @param sdp - The original Session Description Protocol (SDP) string.
 * @param codecList - Array of codec names representing the desired priority order.
 * @returns The modified SDP string with the reordered payloads. If parsing fails, the original SDP is returned.
 *
 * @example
 * ```typescript
 * const newSdp = modifySdpCodecOrder(originalSdp, ['OPUS', 'PCMU']);
 * ```
 */
const modifySdpCodecOrder = (sdp, codecList) => {
    (0, assert_1.default)(Array.isArray(codecList));
    try {
        const codecs = codecList.map((c) => c.toUpperCase());
        const obj = transform.parse(sdp);
        debug(`parsed SDP: ${JSON.stringify(obj)}`);
        for (let i = 0; i < obj.media.length; i++) {
            const sortFn = (0, exports.sortFunctor)(codecs, obj.media[i].rtp);
            debug(`obj.media[i].payloads: ${obj.media[i].payloads}`);
            if (typeof obj.media[i].payloads === 'string') {
                const payloads = obj.media[i].payloads.split(' ');
                debug(`initial list: ${payloads}`);
                payloads.sort(sortFn);
                debug(`resorted payloads: ${payloads}, for codec list ${codecs}`);
                obj.media[i].payloads = payloads.join(' ');
            }
        }
        return transform.write(obj);
    }
    catch (err) {
        console.log(err, `Error parsing SDP: ${sdp}`);
        return sdp;
    }
};
exports.modifySdpCodecOrder = modifySdpCodecOrder;
/**
 * Creates a new object composed of the picked object properties.
 *
 * @param obj - The source object to pick properties from.
 * @param keys - A space-separated string of property names to pick.
 * @returns A new object containing only the picked properties.
 *
 * @example
 * ```typescript
 * const user = { name: 'Bob', age: 30, active: true };
 * const result = pick(user, 'name active'); // { name: 'Bob', active: true }
 * ```
 */
const pick = (obj, keys) => {
    const list = keys.split(' ');
    return list.reduce((acc, key) => {
        if (key in obj) {
            acc[key] = obj[key];
        }
        return acc;
    }, {});
};
exports.pick = pick;
