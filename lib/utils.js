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
