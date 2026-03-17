import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/types.js";
import type { IpcRequest, IpcResponse, AppSettings } from "../shared/types.js";

const api = {
  window: {
    setHeight: (
      height: IpcRequest<typeof IPC_CHANNELS.WINDOW_SET_HEIGHT>,
    ): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_SET_HEIGHT, height),
  },

  app: {
    openExternal: (
      url: IpcRequest<typeof IPC_CHANNELS.APP_OPEN_EXTERNAL>,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.APP_OPEN_EXTERNAL>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),

    getVersion: (): Promise<IpcResponse<typeof IPC_CHANNELS.APP_GET_VERSION>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  },

  settings: {
    get: (): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_GET>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

    set: (
      partial: IpcRequest<typeof IPC_CHANNELS.SETTINGS_SET>,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_SET>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, partial),

    onChanged: (callback: (settings: AppSettings) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, settings: AppSettings): void => {
        callback(settings);
      };
      ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_CHANGED, handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
