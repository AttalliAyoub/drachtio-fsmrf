export declare const parseDecibels: (db: string | number | undefined | null) => number;
export declare const parseBodyText: (txt: string) => Record<string, string | number>;
export declare const sortFunctor: (codecs: string[], rtp: {
    payload?: number;
    codec?: string;
}[]) => (a: string | number, b: string | number) => number;
export declare const modifySdpCodecOrder: (sdp: string, codecList: string[]) => string;
export declare const pick: <T extends object>(obj: T, keys: string) => Partial<T>;
