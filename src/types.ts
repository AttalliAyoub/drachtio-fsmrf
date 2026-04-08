export { Srf, Dialog as SrfDialog, SipRequest as SrfRequest, SipResponse as SrfResponse };
import Srf, { Dialog, SipRequest, SipResponse } from 'drachtio-srf';

export interface EslEvent {
  getHeader(name: string): string;
  firstHeader(): string;
  nextHeader(): string;
  getBody(): string;
}

export interface EslConnection {
  socket: {
    remoteAddress: string;
  };
  connected(): boolean;
  disconnect(): void;
  api(command: string, cb?: (res: EslEvent) => void): void;
  api(command: string, args: string | string[], cb?: (...res: any[]) => void): void;
  execute(app: string, arg?: string, cb?: (evt: EslEvent) => void): void;
  subscribe(events: string | string[]): void;
  filter(header: string, value: string): void;
  on(event: string, callback: (...args: any[]) => void): void;
  once(event: string, callback: (...args: any[]) => void): void;
  removeListener(event: string, listener: (...args: any[]) => void): void;
  removeAllListeners(event?: string): void;
  getInfo(): EslEvent;
}

export interface EslServer {
  close(): void;
  getCountOfConnections(): number;
  on(event: string, callback: (conn: EslConnection, id: string) => void): void;
}
