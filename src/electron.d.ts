import type { AppCommand } from "./types";
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

export type WindowStatePayload = {
  isMaximized: boolean;
};

export interface ElectronAPI {
  system: {
    getLocale: () => Promise<string>;
  };
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<WindowStatePayload>;
    close: () => Promise<void>;
    getState: () => Promise<WindowStatePayload>;
    onStateChange: (callback: (state: WindowStatePayload) => void) => () => void;
  };
  commands: {
    onExecute: (callback: (command: AppCommand) => void) => () => void;
  };
  dialogs: {
    openPng: (payload?: { title?: string; filterName?: string }) => Promise<string | null>;
    savePng: (
      defaultPath: string | null,
      payload?: { title?: string; filterName?: string }
    ) => Promise<string | null>;
  };
  engine: {
    getStatus: () => Promise<EngineStatus>;
    createDocument: (payload: CreateDocumentRequest) => Promise<EngineMutationResult>;
    closeDocument: (payload: CloseDocumentRequest) => Promise<EngineMutationResult>;
    loadPng: (payload: LoadPngRequest) => Promise<LoadedDocumentResult>;
    savePng: (payload: SavePngRequest) => Promise<SaveDocumentResult>;
    beginStroke: (payload: BeginStrokeRequest) => Promise<EngineMutationResult>;
    appendStrokePoints: (payload: AppendStrokePointsRequest) => Promise<EngineMutationResult>;
    endStroke: (payload: EndStrokeRequest) => Promise<EngineMutationResult>;
    cancelStroke: (payload: CancelStrokeRequest) => Promise<EngineMutationResult>;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
