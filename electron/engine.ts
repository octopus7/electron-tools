import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { app } from "electron";
import type {
  AppendStrokePointsRequest,
  BeginStrokeRequest,
  CancelStrokeRequest,
  CloseDocumentRequest,
  CreateDocumentRequest,
  EngineMutationResult,
  EngineStatus,
  EndStrokeRequest,
  LoadPngRequest,
  LoadedDocumentResult,
  SaveDocumentResult,
  SavePngRequest
} from "../shared/engine-protocol.js";

type EngineRequestPayload =
  | {
      type: "createDocument";
      payload: CreateDocumentRequest;
    }
  | {
      type: "closeDocument";
      payload: CloseDocumentRequest;
    }
  | {
      type: "loadPng";
      payload: LoadPngRequest;
    }
  | {
      type: "savePng";
      payload: SavePngRequest;
    }
  | {
      type: "beginStroke";
      payload: BeginStrokeRequest;
    }
  | {
      type: "appendStrokePoints";
      payload: AppendStrokePointsRequest;
    }
  | {
      type: "endStroke";
      payload: EndStrokeRequest;
    }
  | {
      type: "cancelStroke";
      payload: CancelStrokeRequest;
    };

type EngineEnvelope = {
  id: number;
  type: EngineRequestPayload["type"];
  payload: EngineRequestPayload["payload"];
};

type EngineResponseEnvelope = {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
};

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

export class EngineManager {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextRequestId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private status: EngineStatus = {
    available: false,
    detail: "Engine binary has not been resolved yet.",
    binaryPath: null
  };

  async getStatus(): Promise<EngineStatus> {
    await this.ensureStarted();

    return this.status;
  }

  async createDocument(payload: CreateDocumentRequest): Promise<EngineMutationResult> {
    return this.request({
      type: "createDocument",
      payload
    });
  }

  async closeDocument(payload: CloseDocumentRequest): Promise<EngineMutationResult> {
    return this.request({
      type: "closeDocument",
      payload
    });
  }

  async loadPng(payload: LoadPngRequest): Promise<LoadedDocumentResult> {
    return this.request({
      type: "loadPng",
      payload
    });
  }

  async savePng(payload: SavePngRequest): Promise<SaveDocumentResult> {
    return this.request({
      type: "savePng",
      payload
    });
  }

  async beginStroke(payload: BeginStrokeRequest): Promise<EngineMutationResult> {
    return this.request({
      type: "beginStroke",
      payload
    });
  }

  async appendStrokePoints(payload: AppendStrokePointsRequest): Promise<EngineMutationResult> {
    return this.request({
      type: "appendStrokePoints",
      payload
    });
  }

  async endStroke(payload: EndStrokeRequest): Promise<EngineMutationResult> {
    return this.request({
      type: "endStroke",
      payload
    });
  }

  async cancelStroke(payload: CancelStrokeRequest): Promise<EngineMutationResult> {
    return this.request({
      type: "cancelStroke",
      payload
    });
  }

  dispose(): void {
    this.child?.kill();
    this.child = null;
    this.failPendingRequests("Engine process was disposed.");
  }

  private async request<TResult>(payload: EngineRequestPayload): Promise<TResult> {
    await this.ensureStarted();

    if (!this.child || !this.status.available) {
      throw new Error(this.status.detail ?? "Rust engine is unavailable.");
    }

    return new Promise<TResult>((resolve, reject) => {
      const id = this.nextRequestId++;
      const envelope: EngineEnvelope = {
        id,
        type: payload.type,
        payload: payload.payload
      };

      this.pendingRequests.set(id, {
        resolve,
        reject
      });

      this.child!.stdin.write(`${JSON.stringify(envelope)}\n`, (error) => {
        if (!error) {
          return;
        }

        this.pendingRequests.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private async ensureStarted(): Promise<void> {
    if (this.child && this.status.available) {
      return;
    }

    const binaryPath =
      process.env.ELECTRON_TOOLS_ENGINE_BIN ?? resolveEngineBinaryPath(app.getAppPath());

    if (!binaryPath || !fs.existsSync(binaryPath)) {
      this.status = {
        available: false,
        detail:
          "Rust engine binary was not found. Build native/engine first or set ELECTRON_TOOLS_ENGINE_BIN.",
        binaryPath: binaryPath ?? null
      };
      return;
    }

    const child = spawn(binaryPath, [], {
      cwd: path.dirname(binaryPath),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    this.child = child;
    this.status = {
      available: true,
      detail: null,
      binaryPath
    };

    const stdout = readline.createInterface({
      input: child.stdout
    });

    stdout.on("line", (line) => {
      try {
        const response = JSON.parse(line) as EngineResponseEnvelope;
        const pendingRequest = this.pendingRequests.get(response.id);

        if (!pendingRequest) {
          return;
        }

        this.pendingRequests.delete(response.id);

        if (response.ok && response.result !== undefined) {
          pendingRequest.resolve(response.result);
          return;
        }

        pendingRequest.reject(new Error(response.error ?? "Rust engine request failed."));
      } catch (error) {
        console.error("Failed to parse engine response", error);
      }
    });

    child.stderr.on("data", (chunk) => {
      const message = chunk.toString().trim();

      if (message) {
        console.error(`[engine] ${message}`);
      }
    });

    child.on("error", (error) => {
      this.status = {
        available: false,
        detail: error.message,
        binaryPath
      };
      this.child = null;
      this.failPendingRequests(error.message);
    });

    child.on("exit", (code, signal) => {
      this.status = {
        available: false,
        detail: `Rust engine exited unexpectedly (${signal ?? code ?? "unknown"}).`,
        binaryPath
      };
      this.child = null;
      this.failPendingRequests(this.status.detail ?? "Rust engine exited unexpectedly.");
    });
  }

  private failPendingRequests(reason: string): void {
    for (const pendingRequest of this.pendingRequests.values()) {
      pendingRequest.reject(new Error(reason));
    }

    this.pendingRequests.clear();
  }
}

function resolveEngineBinaryPath(appPath: string): string | null {
  const executableName =
    process.platform === "win32" ? "electron-tools-engine.exe" : "electron-tools-engine";
  const candidates = [
    path.join(appPath, "native", "engine", "target", "debug", executableName),
    path.join(appPath, "native", "engine", "target", "release", executableName)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? null;
}
