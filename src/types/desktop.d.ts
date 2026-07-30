export {};

type UpdateStatus =
  | { state: "checking" | "not-available" | "development" }
  | { state: "available" | "downloaded"; version: string; notes: string }
  | { state: "downloading"; percent: number; transferred: number; total: number }
  | { state: "ignored"; version: string }
  | { state: "error"; message: string };

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
      updater: {
        check(): Promise<unknown>;
        download(): Promise<void>;
        defer(): Promise<void>;
        ignore(): Promise<void>;
        install(): Promise<void>;
        onStatus(listener: (status: UpdateStatus) => void): () => void;
      };
    };
  }
}
