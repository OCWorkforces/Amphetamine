/** IPC channel names — single source of truth */
export const IPC_CHANNELS = {
  WINDOW_SET_HEIGHT: "window:set-height",
  APP_GET_VERSION: "app:get-version",
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  SESSION_START: "session:start",
  SESSION_CANCEL: "session:cancel",
  SESSION_STATUS: "session:status",
  SESSION_STATUS_UPDATE: "session:status-update",
  SETTINGS_CHANGED: "settings:changed",
  SETTINGS_OPEN: "settings:open",
  APP_QUIT: "app:quit",
  AUTO_UPDATER_CHECK: "auto-updater:check",
  AUTO_UPDATER_STATUS: "auto-updater:status",
} as const;

/** IPC Request/Response type map for type-safe IPC */
export type IpcChannelMap = {
  [IPC_CHANNELS.WINDOW_SET_HEIGHT]: {
    request: number;
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
  [IPC_CHANNELS.SESSION_START]: {
    request: { durationMinutes: number | null };
    response: { startedAt: number; durationMinutes: number | null; expiresAt: number | null };
  };
  [IPC_CHANNELS.SESSION_CANCEL]: {
    request: undefined;
    response: { cancelled: boolean };
  };
  [IPC_CHANNELS.SESSION_STATUS]: {
    request: undefined;
    response: {
      isRunning: boolean;
      startedAt: number | null;
      expiresAt: number | null;
      remainingSeconds: number | null;
      durationMinutes: number | null;
    } | null;
  };
  [IPC_CHANNELS.SESSION_STATUS_UPDATE]: {
    request: undefined;
    response: {
      isRunning: boolean;
      startedAt: number | null;
      expiresAt: number | null;
      remainingSeconds: number | null;
      durationMinutes: number | null;
    } | null;
  };
  [IPC_CHANNELS.SETTINGS_CHANGED]: {
    request: undefined;
    response: AppSettings;
  };
  [IPC_CHANNELS.SETTINGS_OPEN]: {
    request: undefined;
    response: void;
  };
  [IPC_CHANNELS.APP_QUIT]: {
    request: undefined;
    response: void;
  };
  [IPC_CHANNELS.AUTO_UPDATER_CHECK]: {
    request: undefined;
    response: { version: string; releaseDate: string } | null;
  };
  [IPC_CHANNELS.AUTO_UPDATER_STATUS]: {
    request: undefined;
    response: {
      status: "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
      info?: { version: string; releaseDate: string; releaseNotes?: string };
      progress?: { percent: number; transferred: number; total: number };
      error?: string;
    };
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
  /** Whether to prevent the Mac from sleeping */
  preventSleep: boolean;
  /** Session duration in minutes, null = indefinite */
  sessionDuration: number | null;
  /** Battery threshold (0-100) — auto-stop sleep prevention when on battery below threshold. 0 = disabled */
  batteryThreshold?: number;
  /** Global keyboard shortcut to toggle sleep prevention (e.g. Cmd+Shift+A). Empty string = use default */
  shortcut?: string;
}

/** Default settings values */
export const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
  preventSleep: false,
  sessionDuration: null,
  batteryThreshold: 0,
  shortcut: "",
};
