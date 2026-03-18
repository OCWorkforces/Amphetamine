import type { AppSettings } from "../shared/types.js";

declare global {
  interface Window {
    api: {
      window: {
        setHeight(height: number): void;
      };
      app: {
        getVersion(): Promise<string>;
      };
      settings: {
        get(): Promise<AppSettings>;
        set(partial: Partial<AppSettings>): Promise<AppSettings>;
      };
    };
  }
}

export {};
