export {};

declare global {
  interface Window {
    electrobun?: {
      rpc?: {
        invoke(method: string, ...args: any[]): Promise<any>;
      };
    };
  }
}
