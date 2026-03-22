import type { AppSettings } from "../shared/types.js";

interface SessionStartResponse {
  startedAt: number;
  durationMinutes: number | null;
  expiresAt: number | null;
}

interface SessionStatusResponse {
  isRunning: boolean;
  startedAt: number | null;
  expiresAt: number | null;
  remainingSeconds: number | null;
  durationMinutes: number | null;
}

declare global {
  interface Window {
    api: {
      window: {
        setHeight(_height: number): void;
      };
      app: {
        getVersion(): Promise<string>;
      };
      settings: {
        get(): Promise<AppSettings>;
        set(_partial: Partial<AppSettings>): Promise<AppSettings>;
        open(): Promise<void>;
      };
      session: {
        start(_durationMinutes: number | null): Promise<SessionStartResponse>;
        cancel(): Promise<{ cancelled: boolean }>;
        getStatus(): Promise<SessionStatusResponse | null>;
      };
        onSettingsChanged(_callback: (settings: AppSettings) => void): () => void;
      autoUpdater: {
        checkForUpdates(): Promise<{ version: string; releaseDate: string } | null>;
        onStatus(
          _callback: (data: {
            status: "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
            info?: { version: string; releaseDate: string; releaseNotes?: string };
            progress?: { percent: number; transferred: number; total: number };
            error?: string;
          }) => void,
        ): () => void;
      };
    };
  }
}

export {};
