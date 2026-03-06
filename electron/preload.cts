import type {
  AppendStrokePointsRequest,
  BeginStrokeRequest,
  CancelStrokeRequest,
  CloseDocumentRequest,
  CreateDocumentRequest,
  EngineMutationResult,
  EngineStatus,
  EndStrokeRequest
} from "../shared/engine-protocol";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
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
  engine: {
    getStatus: (): Promise<EngineStatus> => ipcRenderer.invoke("engine:getStatus"),
    createDocument: (payload: CreateDocumentRequest): Promise<EngineMutationResult> =>
      ipcRenderer.invoke("engine:createDocument", payload),
    closeDocument: (payload: CloseDocumentRequest): Promise<EngineMutationResult> =>
      ipcRenderer.invoke("engine:closeDocument", payload),
    beginStroke: (payload: BeginStrokeRequest): Promise<EngineMutationResult> =>
      ipcRenderer.invoke("engine:beginStroke", payload),
    appendStrokePoints: (payload: AppendStrokePointsRequest): Promise<EngineMutationResult> =>
      ipcRenderer.invoke("engine:appendStrokePoints", payload),
    endStroke: (payload: EndStrokeRequest): Promise<EngineMutationResult> =>
      ipcRenderer.invoke("engine:endStroke", payload),
    cancelStroke: (payload: CancelStrokeRequest): Promise<EngineMutationResult> =>
      ipcRenderer.invoke("engine:cancelStroke", payload)
  }
});
