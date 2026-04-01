import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/types.js";
import type { AppSettings, IpcRequest, IpcResponse } from "../shared/types.js";

const api = {
  window: {
    setHeight: (
      height: IpcRequest<typeof IPC_CHANNELS.WINDOW_SET_HEIGHT>,
    ): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_SET_HEIGHT, height),
  },

  app: {
    getVersion: (): Promise<IpcResponse<typeof IPC_CHANNELS.APP_GET_VERSION>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  },

  quit: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.APP_QUIT,
      undefined as IpcRequest<typeof IPC_CHANNELS.APP_QUIT>,
    ),

  settings: {
    get: (): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_GET>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

    set: (
      partial: IpcRequest<typeof IPC_CHANNELS.SETTINGS_SET>,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_SET>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, partial),

    open: () =>
      ipcRenderer.invoke(
        IPC_CHANNELS.SETTINGS_OPEN,
        undefined as IpcRequest<typeof IPC_CHANNELS.SETTINGS_OPEN>,
      ),
  },

  session: {
    start: (durationMinutes: number | null) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.SESSION_START,
        { durationMinutes } as IpcRequest<typeof IPC_CHANNELS.SESSION_START>,
      ),
    cancel: () =>
      ipcRenderer.invoke(
        IPC_CHANNELS.SESSION_CANCEL,
        undefined as IpcRequest<typeof IPC_CHANNELS.SESSION_CANCEL>,
      ),
    getStatus: () =>
      ipcRenderer.invoke(
        IPC_CHANNELS.SESSION_STATUS,
        undefined as IpcRequest<typeof IPC_CHANNELS.SESSION_STATUS>,
      ),
  },

  onSettingsChanged: (callback: (_settings: AppSettings) => void) => {
    const listener = (_event: unknown, settings: AppSettings) => {
      callback(settings);
    };
    ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_CHANGED, listener);
    };
  },

  onSessionStatusUpdate: (
    callback: (_data: IpcResponse<typeof IPC_CHANNELS.SESSION_STATUS_UPDATE>) => void,
  ) => {
    const listener = (
      _event: unknown,
      data: IpcResponse<typeof IPC_CHANNELS.SESSION_STATUS_UPDATE>,
    ) => {
      callback(data);
    };
    ipcRenderer.on(IPC_CHANNELS.SESSION_STATUS_UPDATE, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SESSION_STATUS_UPDATE, listener);
    };
  },

  autoUpdater: {
    checkForUpdates: () =>
      ipcRenderer.invoke(
        IPC_CHANNELS.AUTO_UPDATER_CHECK,
        undefined as IpcRequest<typeof IPC_CHANNELS.AUTO_UPDATER_CHECK>,
      ),
    onStatus: (callback: (_data: IpcResponse<typeof IPC_CHANNELS.AUTO_UPDATER_STATUS>) => void) => {
      const listener = (_event: unknown, data: IpcResponse<typeof IPC_CHANNELS.AUTO_UPDATER_STATUS>) => {
        callback(data);
      };
      ipcRenderer.on(IPC_CHANNELS.AUTO_UPDATER_STATUS, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.AUTO_UPDATER_STATUS, listener);
      };
    },
  },
};


contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
