import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
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

type EngineResponseHeader = {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
  pixelPayloadByteLength: number;
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
  private stdoutBuffer = Buffer.alloc(0);

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
    this.stdoutBuffer = Buffer.alloc(0);
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
      const requestBytes = Buffer.from(JSON.stringify(envelope), "utf8");
      const lengthPrefix = Buffer.allocUnsafe(4);

      lengthPrefix.writeUInt32LE(requestBytes.length, 0);

      this.pendingRequests.set(id, {
        resolve,
        reject
      });

      this.child!.stdin.write(Buffer.concat([lengthPrefix, requestBytes]), (error) => {
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
    this.stdoutBuffer = Buffer.alloc(0);
    this.status = {
      available: true,
      detail: null,
      binaryPath
    };

    child.stdout.on("data", (chunk: Buffer) => {
      this.handleStdoutChunk(chunk);
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
      this.stdoutBuffer = Buffer.alloc(0);
      this.failPendingRequests(error.message);
    });

    child.on("exit", (code, signal) => {
      this.status = {
        available: false,
        detail: `Rust engine exited unexpectedly (${signal ?? code ?? "unknown"}).`,
        binaryPath
      };
      this.child = null;
      this.stdoutBuffer = Buffer.alloc(0);
      this.failPendingRequests(this.status.detail ?? "Rust engine exited unexpectedly.");
    });
  }

  private handleStdoutChunk(chunk: Buffer) {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);

    while (this.stdoutBuffer.length >= 4) {
      const headerLength = this.stdoutBuffer.readUInt32LE(0);

      if (this.stdoutBuffer.length < 4 + headerLength) {
        return;
      }

      const headerBytes = this.stdoutBuffer.subarray(4, 4 + headerLength);
      let header: EngineResponseHeader;

      try {
        header = JSON.parse(headerBytes.toString("utf8")) as EngineResponseHeader;
      } catch (error) {
        console.error("Failed to parse engine response header", error);
        this.stdoutBuffer = Buffer.alloc(0);
        return;
      }

      const payloadLength = header.pixelPayloadByteLength ?? 0;
      const frameLength = 4 + headerLength + payloadLength;

      if (this.stdoutBuffer.length < frameLength) {
        return;
      }

      const payloadBuffer =
        payloadLength > 0
          ? this.stdoutBuffer.subarray(4 + headerLength, frameLength)
          : Buffer.alloc(0);

      this.stdoutBuffer = this.stdoutBuffer.subarray(frameLength);
      this.resolvePendingRequest(header, payloadBuffer);
    }
  }

  private resolvePendingRequest(header: EngineResponseHeader, payloadBuffer: Buffer) {
    const pendingRequest = this.pendingRequests.get(header.id);

    if (!pendingRequest) {
      return;
    }

    this.pendingRequests.delete(header.id);

    if (!header.ok) {
      pendingRequest.reject(new Error(header.error ?? "Rust engine request failed."));
      return;
    }

    pendingRequest.resolve(attachPixelPayload(header.result, payloadBuffer));
  }

  private failPendingRequests(message: string) {
    for (const pendingRequest of this.pendingRequests.values()) {
      pendingRequest.reject(new Error(message));
    }

    this.pendingRequests.clear();
  }
}

function attachPixelPayload(result: unknown, payloadBuffer: Buffer): unknown {
  if (!result || typeof result !== "object" || !("dirtyDisplayTiles" in result)) {
    return result;
  }

  return {
    ...result,
    pixelPayload:
      payloadBuffer.byteLength > 0
        ? payloadBuffer.buffer.slice(
            payloadBuffer.byteOffset,
            payloadBuffer.byteOffset + payloadBuffer.byteLength
          )
        : null
  };
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

  return null;
}
