import * as transform from 'sdp-transform';
import assert from 'assert';
import createDebug from 'debug';

const debug = createDebug('drachtio:fsmrf');

export const parseDecibels = (db: string | number | undefined | null): number => {
  if (!db) return 0;
  if (typeof db === 'number') {
    return db;
  } else if (typeof db === 'string') {
    const match = db.match(/([+-]?\d+(\.\d+)?)\s*db/i);
    if (match) {
      return Math.trunc(parseFloat(match[1]));
    } else {
      return 0;
    }
  } else {
    return 0;
  }
};

export const parseBodyText = (txt: string): Record<string, string | number> => {
  return txt.split('\n').reduce((obj: Record<string, string | number>, line: string) => {
    const data = line.split(': ');
    const key = data.shift();
    if (!key) return obj;
    const value = decodeURIComponent(data.shift() || '');

    if (
      key.indexOf('variable_rtp_audio') === 0 ||
      key.indexOf('variable_rtp_video') === 0 ||
      key.indexOf('variable_playback') === 0
    ) {
      obj[key] = parseInt(value, 10);
    } else if (key && key.length > 0) {
      obj[key] = value;
    }

    return obj;
  }, {});
};

export const sortFunctor = (codecs: string[], rtp: any[]) => {
  const DEFAULT_SORT_ORDER = 999;
  const rtpMap = new Map<number, string>();
  rtpMap.set(0, 'PCMU');
  rtpMap.set(8, 'PCMA');
  rtpMap.set(18, 'G.729');
  rtpMap.set(18, 'G729');
  rtp.forEach((r) => {
    if (r.codec && r.payload !== undefined) {
      const name = r.codec.toUpperCase();
      if (name !== 'TELEPHONE-EVENT') rtpMap.set(r.payload, name);
    }
  });

  function score(pt: string | number): number {
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
  return function(a: string | number, b: string | number): number {
    return score(a) - score(b);
  };
};

export const modifySdpCodecOrder = (sdp: string, codecList: string[]): string => {
  assert(Array.isArray(codecList));

  try {
    const codecs = codecList.map((c) => c.toUpperCase());
    const obj = transform.parse(sdp);
    debug(`parsed SDP: ${JSON.stringify(obj)}`);

    for (let i = 0; i < obj.media.length; i++) {
      const sortFn = sortFunctor(codecs, obj.media[i].rtp);
      debug(`obj.media[i].payloads: ${obj.media[i].payloads}`);
      if (typeof obj.media[i].payloads === 'string') {
        const payloads = (obj.media[i].payloads as string).split(' ');
        debug(`initial list: ${payloads}`);
        payloads.sort(sortFn);
        debug(`resorted payloads: ${payloads}, for codec list ${codecs}`);
        obj.media[i].payloads = payloads.join(' ');
      }
    }
    return transform.write(obj);
  } catch (err) {
    console.log(err, `Error parsing SDP: ${sdp}`);
    return sdp;
  }
};

export const pick = <T extends Record<string, any>>(obj: T, keys: string): Partial<T> => {
  const list = keys.split(' ');
  return list.reduce((acc: Partial<T>, key: string) => {
    if (key in obj) {
      acc[key as keyof T] = obj[key];
    }
    return acc;
  }, {});
};
