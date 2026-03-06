import type { AppCommand } from "./types";
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

export type WindowStatePayload = {
  isMaximized: boolean;
};

export interface ElectronAPI {
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
  engine: {
    getStatus: () => Promise<EngineStatus>;
    createDocument: (payload: CreateDocumentRequest) => Promise<EngineMutationResult>;
    closeDocument: (payload: CloseDocumentRequest) => Promise<EngineMutationResult>;
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
