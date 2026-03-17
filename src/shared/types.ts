/** IPC channel names — single source of truth */
export const IPC_CHANNELS = {
  WINDOW_SET_HEIGHT: "window:set-height",
  APP_OPEN_EXTERNAL: "app:open-external",
  APP_GET_VERSION: "app:get-version",
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  SETTINGS_CHANGED: "settings:changed",
} as const;

/** IPC Request/Response type map for type-safe IPC */
export type IpcChannelMap = {
  [IPC_CHANNELS.WINDOW_SET_HEIGHT]: {
    request: number;
    response: void;
  };
  [IPC_CHANNELS.APP_OPEN_EXTERNAL]: {
    request: string;
    response: void;
  };
  [IPC_CHANNELS.APP_GET_VERSION]: {
    request: void;
    response: string;
  };
  [IPC_CHANNELS.SETTINGS_GET]: {
    request: void;
    response: AppSettings;
  };
  [IPC_CHANNELS.SETTINGS_SET]: {
    request: Partial<AppSettings>;
    response: AppSettings;
  };
};

/** Type utilities for type-safe IPC */
export type IpcChannel = keyof IpcChannelMap;
export type IpcRequest<K extends IpcChannel> = IpcChannelMap[K]["request"];
export type IpcResponse<K extends IpcChannel> = IpcChannelMap[K]["response"];

/** Application settings */
export interface AppSettings {
  /** Whether to launch the app at login (auto-start on system restart) */
  launchAtLogin: boolean;
}

/** Default settings values */
export const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
};
