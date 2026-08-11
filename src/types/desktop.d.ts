export {};

type ManualUpdateStatus =
  | { state: "current"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string }
  | { state: "available"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string }
  | { state: "error"; currentVersion: string; message: string; url?: string };

type DesktopNetworkCheck = {
  id: "network" | "github" | "huggingface";
  label: string;
  ok: boolean;
  status?: number;
  durationMs: number;
  failureKind?: "timeout" | "dns" | "tls" | "proxy" | "connection" | "http" | "unknown";
  detail: string;
};

type DesktopNetworkDiagnostics = {
  layer: { id: "electron"; label: string; transport: string; checks: DesktopNetworkCheck[] };
  guidance?: string;
};

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
      network: {
        diagnostics(): Promise<DesktopNetworkDiagnostics>;
      };
      cloudSync: {
        credentialStatus(): Promise<{ configured: boolean; secureStorageAvailable: boolean }>;
        saveCredential(password: string): Promise<{ configured: boolean; secureStorageAvailable: boolean }>;
      };
      supabaseSync: {
        sessionStatus(): Promise<{ configured: boolean; secureStorageAvailable: boolean }>;
        saveSession(value: string): Promise<{ configured: boolean; secureStorageAvailable: boolean }>;
      };
      server: {
        onStatus(listener: (status: { state: "ready" } | { state: "error"; message: string }) => void): () => void;
      };
    };
  }
}
