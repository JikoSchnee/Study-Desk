export {};

type ManualUpdateStatus =
  | { state: "current"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string }
  | { state: "available"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string }
  | { state: "downloading"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string; percent: number }
  | { state: "downloaded"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string }
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
        status(): Promise<ManualUpdateStatus | null>;
        download(): Promise<ManualUpdateStatus>;
        install(): Promise<void>;
        onStatus(listener: (status: ManualUpdateStatus) => void): () => void;
      };
      network: {
        diagnostics(): Promise<DesktopNetworkDiagnostics>;
      };
      cloudSync: {
        credentialStatus(): Promise<{ configured: boolean; secureStorageAvailable: boolean }>;
        saveCredential(password: string): Promise<{ configured: boolean; secureStorageAvailable: boolean }>;
      };
      supabaseSync: {
        sessionStatus(): Promise<{ configured: boolean; signedIn: boolean; email: string | null; secureStorageAvailable: boolean }>;
        saveSession(value: string): Promise<{ configured: boolean; secureStorageAvailable: boolean }>;
        onMagicLink(listener: (result: { ok: boolean; message: string }) => void): () => void;
        onSessionChange(listener: (result: { configured: boolean; signedIn: boolean; email: string | null; secureStorageAvailable: boolean }) => void): () => void;
      };
      server: {
        onStatus(listener: (status: { state: "ready" } | { state: "error"; message: string }) => void): () => void;
      };
    };
  }
}
