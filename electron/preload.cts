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
} from "../shared/engine-protocol";

const { contextBridge, ipcRenderer } = require("electron");

type EngineRequestType =
  | "createDocument"
  | "closeDocument"
  | "loadPng"
  | "savePng"
  | "beginStroke"
  | "appendStrokePoints"
  | "endStroke"
  | "cancelStroke";

type EngineResponseEnvelope<TResult> = {
  ok: boolean;
  result?: TResult;
  error?: string;
};

let nextEngineRequestId = 1;

contextBridge.exposeInMainWorld("electronAPI", {
  system: {
    getLocale: (): Promise<string> => ipcRenderer.invoke("system:getLocale")
  },
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggleMaximize"),
    close: () => ipcRenderer.invoke("window:close"),
    getState: () => ipcRenderer.invoke("window:getState"),
    onStateChange: (callback: (state: { isMaximized: boolean }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: { isMaximized: boolean }) => {
        callback(state);
      };

      ipcRenderer.on("window:state", listener);

      return () => {
        ipcRenderer.removeListener("window:state", listener);
      };
    }
  },
  commands: {
    onExecute: (callback: (command: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, command: string) => {
        callback(command);
      };

      ipcRenderer.on("app:command", listener);

      return () => {
        ipcRenderer.removeListener("app:command", listener);
      };
    }
  },
  dialogs: {
    openPng: (payload?: { title?: string; filterName?: string }): Promise<string | null> =>
      ipcRenderer.invoke("dialog:openPng", payload),
    savePng: (
      defaultPath: string | null,
      payload?: { title?: string; filterName?: string }
    ): Promise<string | null> =>
      ipcRenderer.invoke("dialog:savePng", {
        defaultPath,
        ...payload
      })
  },
  engine: {
    getStatus: (): Promise<EngineStatus> => ipcRenderer.invoke("engine:getStatus"),
    createDocument: (payload: CreateDocumentRequest): Promise<EngineMutationResult> =>
      sendEngineRequest("createDocument", payload),
    closeDocument: (payload: CloseDocumentRequest): Promise<EngineMutationResult> =>
      sendEngineRequest("closeDocument", payload),
    loadPng: (payload: LoadPngRequest): Promise<LoadedDocumentResult> =>
      sendEngineRequest("loadPng", payload),
    savePng: (payload: SavePngRequest): Promise<SaveDocumentResult> =>
      sendEngineRequest("savePng", payload),
    beginStroke: (payload: BeginStrokeRequest): Promise<EngineMutationResult> =>
      sendEngineRequest("beginStroke", payload),
    appendStrokePoints: (payload: AppendStrokePointsRequest): Promise<EngineMutationResult> =>
      sendEngineRequest("appendStrokePoints", payload),
    endStroke: (payload: EndStrokeRequest): Promise<EngineMutationResult> =>
      sendEngineRequest("endStroke", payload),
    cancelStroke: (payload: CancelStrokeRequest): Promise<EngineMutationResult> =>
      sendEngineRequest("cancelStroke", payload)
  }
});

function sendEngineRequest<TResult>(type: EngineRequestType, payload: unknown): Promise<TResult> {
  return new Promise<TResult>((resolve, reject) => {
    const requestId = nextEngineRequestId++;
    const responseChannel = `engine:response:${requestId}`;
    const listener = (
      _event: Electron.IpcRendererEvent,
      response: EngineResponseEnvelope<TResult>
    ) => {
      ipcRenderer.removeListener(responseChannel, listener);

      if (!response.ok) {
        reject(new Error(response.error ?? "Engine request failed."));
        return;
      }

      resolve(normalizeBinaryPayload(response.result));
    };

    ipcRenderer.on(responseChannel, listener);
    ipcRenderer.send("engine:request", {
      requestId,
      type,
      payload
    });
  });
}

function normalizeBinaryPayload<TResult>(result: TResult | undefined): TResult {
  if (!result || typeof result !== "object") {
    return result as TResult;
  }

  const candidate = result as { pixelPayload?: ArrayBuffer | Uint8Array | null };

  if (!("pixelPayload" in candidate)) {
    return result;
  }

  return {
    ...result,
    pixelPayload: toArrayBuffer(candidate.pixelPayload)
  };
}

function toArrayBuffer(value: ArrayBuffer | Uint8Array | null | undefined): ArrayBuffer | null {
  if (!value) {
    return null;
  }

  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return value.slice().buffer;
  }

  return null;
}
