declare module 'electrobun/main/native' {
  export const native: {
    symbols: {
      forceExit(code: number): void;
      stopEventLoop(): void;
    };
  } | null;
}

declare module 'electrobun/main' {
  interface RPCSchema<T = any> {
    requests?: { [K in keyof T]: { params: any; response: any } };
    messages?: { [K in keyof T]: unknown };
  }

  interface ElectrobunRPCSchema {
    bun: RPCSchema;
    webview: RPCSchema;
  }

  interface RPCWithTransport {
    setTransport(transport: any): void;
  }

  interface BrowserWindowOptions {
    title?: string;
    url?: string;
    html?: string;
    frame?: { x?: number; y?: number; width: number; height: number };
    rpc?: RPCWithTransport;
  }

  class BrowserWindow {
    static getById(id: number): BrowserWindow | undefined;
    constructor(options?: BrowserWindowOptions);
    id: number;
    title: string;
    loadURL(url: string): void;
    show(): void;
    hide(): void;
    close(): void;
    isVisible(): boolean;
    on(event: string, callback: (event: any) => void): void;
    readonly webview: {
      openDevTools(): void;
      loadURL(url: string): void;
      on(event: string, callback: (event: any) => void): void;
      executeJavascript(js: string): void;
    };
  }

  class Tray {
    static removeById(id: number): void;
    constructor(options?: { title?: string; image?: string });
    id: number;
    setImage(path: string): void;
    setMenu(template: any[]): void;
    on(event: string, callback: (event: any) => void): void;
    remove(): void;
  }

  class BrowserView {
    static defineRPC<Schema extends ElectrobunRPCSchema>(config: {
      maxRequestTime?: number;
      handlers: {
        requests?: {
          [K in keyof Schema['bun']['requests']]?: (
            params: Schema['bun']['requests'][K]['params']
          ) => Schema['bun']['requests'][K]['response'] | Promise<Schema['bun']['requests'][K]['response']>;
        };
        messages?: { [K: string]: (payload: any) => void };
      };
    }): RPCWithTransport;
  }

  namespace Utils {
    function showNotification(options: { title: string; body: string; icon?: string }): void;
    function quit(): void;
  }

  namespace ApplicationMenu {
    function setApplicationMenu(menu: any[]): void;
    function on(event: string, callback: (event: any) => void): void;
  }

  export { BrowserWindow, BrowserWindowOptions, BrowserView, Tray, Utils, ApplicationMenu };
}

declare module 'electrobun' {
  interface RPCSchema<T = any> {
    requests?: { [K in keyof T]: { params: any; response: any } };
    messages?: { [K in keyof T]: unknown };
  }

  interface ElectrobunRPCSchema {
    bun: RPCSchema;
    webview: RPCSchema;
  }

  interface RPCWithTransport {
    setTransport(transport: any): void;
  }

  type RPCRequestProxy<Requests extends { [key: string]: { params: any; response: any } }> = {
    [K in keyof Requests]: (params: Requests[K]['params']) => Promise<Requests[K]['response']>;
  };

  class Electroview<T extends { request: any; send: any }> {
    constructor(config: { rpc: T });
    static defineRPC<Schema extends ElectrobunRPCSchema>(config: {
      maxRequestTime?: number;
      handlers: {
        requests?: {
          [K in keyof Schema['webview']['requests']]?: (
            params: Schema['webview']['requests'][K]['params']
          ) => Schema['webview']['requests'][K]['response'] | Promise<Schema['webview']['requests'][K]['response']>;
        };
        messages?: { [K: string]: (payload: any) => void };
      };
    }): {
      request: RPCRequestProxy<Schema['bun']['requests']> & { [key: string]: any };
      send: any;
      setTransport: (t: any) => void;
    } & RPCWithTransport;
  }

  export { Electroview };
}
