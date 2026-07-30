export {};

type ManualUpdateStatus =
  | { state: "current"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string }
  | { state: "available"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string }
  | { state: "error"; currentVersion: string; message: string };

declare global {
  interface Window {
    mockInterviewDesktop?: {
      platform: NodeJS.Platform;
      window: {
        minimize(): Promise<void>;
        toggleMaximize(): Promise<void>;
        close(): Promise<void>;
        isMaximized(): Promise<boolean>;
        onMaximizeChange(listener: (maximized: boolean) => void): () => void;
      };
      updates: {
        check(): Promise<ManualUpdateStatus>;
      };
    };
  }
}
