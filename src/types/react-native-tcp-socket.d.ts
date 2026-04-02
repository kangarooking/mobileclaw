/**
 * Type declarations for react-native-tcp-socket
 * This library has no built-in TypeScript definitions.
 */

declare module 'react-native-tcp-socket' {
  import { EventEmitter } from 'eventemitter3';

  interface SocketEvents {
    connect: () => void;
    data: (data: Buffer | Uint8Array | string) => void;
    error: (err: Error) => void;
    close: (hadError: boolean) => void;
    drain: () => void;
    timeout: () => void;
  }

  interface TLSSocketEvents extends SocketEvents {
    secureConnect: () => void;
  }

  export class Socket extends EventEmitter<SocketEvents> {
    connecting: boolean;
    pending: boolean;
    destroyed: boolean;
    localAddress?: string;
    localPort?: number;
    remoteAddress?: string;
    remotePort?: number;
    remoteFamily?: string;
    readableHighWaterMark: number;
    writableHighWaterMark: number;

    connect(options: {
      host?: string;
      port: number;
      localAddress?: string;
      localPort?: number;
      interface?: string;
      reuseAddress?: boolean;
      tls?: boolean;
      tlsCheckValidity?: boolean;
      connectTimeout?: number;
    }, callback?: () => void): this;

    write(data: string | Buffer | Uint8Array): boolean;
    end(data?: string | Buffer | Uint8Array): this;
    destroy(): this;
    pause(): this;
    resume(): this;
    ref(): this;
    unref(): this;
    setNoDelay(noDelay?: boolean): this;
    setKeepAlive(enable?: boolean, initialDelay?: number): this;
    address(): { address: string; family: string; port: number };
  }

  export class TLSSocket extends Socket {
    // TLSSocket inherits all Socket methods: on, write, end, connect, etc.
    // Adds secureConnect event for TLS handshake completion
  }

  const tcpSockets: {
    connect: (options: {
      host?: string;
      port: number;
      localAddress?: string;
      localPort?: number;
      interface?: string;
      reuseAddress?: boolean;
      tls?: boolean;
      tlsCheckValidity?: boolean;
      connectTimeout?: number;
    }, callback?: () => void) => Socket;
    createServer: any;
    createConnection: any;
    createTLSServer: any;
    connectTLS: (options: {
      host?: string;
      port: number;
      ca?: any;
      key?: any;
      cert?: any;
      androidKeyStore?: string;
      certAlias?: string;
      keyAlias?: string;
      resolvedKeys?: string[];
      tlsCheckValidity?: boolean;
      connectTimeout?: number;
    }, callback?: () => void) => TLSSocket;
    isIP: (input: string) => number;
    isIPv4: (input: string) => boolean;
    isIPv6: (input: string) => boolean;
    Server: typeof Socket;
    Socket: typeof Socket;
    TLSServer: any;
    TLSSocket: typeof TLSSocket;
    hasIdentity: (options?: any) => Promise<boolean>;
  };

  export default tcpSockets;
}
