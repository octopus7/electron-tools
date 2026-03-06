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
  }
});
