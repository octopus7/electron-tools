import type { AppCommand } from "./types";

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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
