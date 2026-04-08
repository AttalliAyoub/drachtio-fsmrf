import Srf from 'drachtio-srf';
export { Srf };
export type SrfDialog = Srf.Dialog;
export type SrfRequest = Srf.SipRequest;
export type SrfResponse = Srf.SipResponse;
/**
 * Represents an event object received from the FreeSWITCH Event Socket.
 */
export interface EslEvent {
    /**
     * Retrieves the value of a specific header from the event.
     * @param name - The name of the header to retrieve.
     * @returns The value of the header.
     */
    getHeader(name: string): string;
    /**
     * Retrieves the name of the first header in the event.
     * @returns The name of the first header.
     */
    firstHeader(): string;
    /**
     * Retrieves the name of the next header in the event.
     * @returns The name of the next header.
     */
    nextHeader(): string;
    /**
     * Retrieves the body content of the event.
     * @returns The body string.
     */
    getBody(): string;
}
/**
 * Represents an active connection to the FreeSWITCH Event Socket (outbound or inbound).
 */
export interface EslConnection {
    /** The underlying socket connection. */
    socket: {
        /** The remote IP address of the connection. */
        remoteAddress: string;
    };
    /** Checks if the connection is currently active. */
    connected(): boolean;
    /** Disconnects from the event socket. */
    disconnect(): void;
    /** Executes a FreeSWITCH API command. */
    api(command: string, cb?: (res: EslEvent) => void): void;
    api(command: string, args: string | string[], cb?: (...res: any[]) => void): void;
    /** Executes a FreeSWITCH dialplan application on the channel. */
    execute(app: string, arg?: string, cb?: (evt: EslEvent) => void): void;
    /** Subscribes to specific FreeSWITCH events. */
    subscribe(events: string | string[]): void;
    /** Applies a filter to only receive events matching a specific header/value. */
    filter(header: string, value: string): void;
    /** Listens for events on this connection. */
    on(event: string, callback: (...args: any[]) => void): void;
    /** Listens for a one-time event on this connection. */
    once(event: string, callback: (...args: any[]) => void): void;
    /** Removes a specific event listener. */
    removeListener(event: string, listener: (...args: any[]) => void): void;
    /** Removes all listeners for a given event, or all listeners if no event is specified. */
    removeAllListeners(event?: string): void;
    /** Retrieves the channel information event (often used upon initial connection). */
    getInfo(): EslEvent;
}
/**
 * Represents the local outbound Event Socket Server that listens for incoming
 * connections from FreeSWITCH.
 */
export interface EslServer {
    /** Closes the server and stops listening for new connections. */
    close(): void;
    /** Gets the current number of active connections to the server. */
    getCountOfConnections(): number;
    /** Listens for events (like 'connection::ready' or 'connection::close'). */
    on(event: string, callback: (conn: EslConnection, id: string) => void): void;
}
