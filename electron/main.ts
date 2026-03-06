import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type OpenDialogOptions,
  type SaveDialogOptions
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EngineManager } from "./engine.js";
import type {
  AppendStrokePointsRequest,
  BeginStrokeRequest,
  CancelStrokeRequest,
  CloseDocumentRequest,
  CreateDocumentRequest,
  EndStrokeRequest,
  LoadPngRequest,
  SavePngRequest
} from "../shared/engine-protocol.js";

type AppCommand =
  | "file:new"
  | "file:open"
  | "file:save"
  | "file:saveAs"
  | "file:options"
  | "file:exit"
  | "edit:copy"
  | "edit:paste"
  | "help:about";

const acceleratorMap = new Map<string, AppCommand>([
  ["N", "file:new"],
  ["O", "file:open"],
  ["S", "file:save"],
  ["C", "edit:copy"],
  ["V", "edit:paste"]
]);

let mainWindow: BrowserWindow | null = null;
const engineManager = new EngineManager();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sendWindowState(window: BrowserWindow): void {
  window.webContents.send("window:state", {
    isMaximized: window.isMaximized()
  });
}

function dispatchCommand(window: BrowserWindow, command: AppCommand): void {
  window.webContents.send("app:command", command);
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    frame: false,
    backgroundColor: "#0e1419",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  const rendererUrl = process.env.VITE_DEV_SERVER_URL;

  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  window.once("ready-to-show", () => {
    window.show();
    sendWindowState(window);
  });

  window.on("maximize", () => sendWindowState(window));
  window.on("unmaximize", () => sendWindowState(window));
  window.on("enter-full-screen", () => sendWindowState(window));
  window.on("leave-full-screen", () => sendWindowState(window));

  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !input.control || input.meta || input.alt) {
      return;
    }

    const command = acceleratorMap.get(input.key.toUpperCase());

    if (!command) {
      return;
    }

    event.preventDefault();
    dispatchCommand(window, command);
  });

  return window;
}

app.whenReady().then(() => {
  mainWindow = createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  engineManager.dispose();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle("window:toggleMaximize", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window) {
    return { isMaximized: false };
  }

  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }

  return { isMaximized: window.isMaximized() };
});

ipcMain.handle("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle("window:getState", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  return {
    isMaximized: window?.isMaximized() ?? false
  };
});

ipcMain.handle("system:getLocale", () => {
  const [preferredLocale] = app.getPreferredSystemLanguages();

  return preferredLocale ?? app.getLocale();
});

ipcMain.handle(
  "dialog:openPng",
  async (
    event,
    payload:
      | {
          title?: string;
          filterName?: string;
        }
      | undefined
  ) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = {
    title: payload?.title ?? "Open PNG",
    properties: ["openFile"],
    filters: [
      {
        name: payload?.filterName ?? "PNG Images",
        extensions: ["png"]
      }
    ]
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);

  return result.canceled ? null : result.filePaths[0] ?? null;
}
);

ipcMain.handle(
  "dialog:savePng",
  async (
    event,
    payload:
      | {
          defaultPath: string | null;
          title?: string;
          filterName?: string;
        }
      | undefined
  ) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options: SaveDialogOptions = {
      title: payload?.title ?? "Save PNG",
      defaultPath: payload?.defaultPath ?? undefined,
      filters: [
        {
          name: payload?.filterName ?? "PNG Images",
          extensions: ["png"]
        }
      ]
    };
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) {
      return null;
    }

    return ensurePngFilePath(result.filePath);
  }
);

ipcMain.handle("engine:getStatus", async () => engineManager.getStatus());
ipcMain.handle("engine:createDocument", async (_event, payload: CreateDocumentRequest) =>
  engineManager.createDocument(payload)
);
ipcMain.handle("engine:closeDocument", async (_event, payload: CloseDocumentRequest) =>
  engineManager.closeDocument(payload)
);
ipcMain.handle("engine:loadPng", async (_event, payload: LoadPngRequest) =>
  engineManager.loadPng(payload)
);
ipcMain.handle("engine:savePng", async (_event, payload: SavePngRequest) =>
  engineManager.savePng(payload)
);
ipcMain.handle("engine:beginStroke", async (_event, payload: BeginStrokeRequest) =>
  engineManager.beginStroke(payload)
);
ipcMain.handle("engine:appendStrokePoints", async (_event, payload: AppendStrokePointsRequest) =>
  engineManager.appendStrokePoints(payload)
);
ipcMain.handle("engine:endStroke", async (_event, payload: EndStrokeRequest) =>
  engineManager.endStroke(payload)
);
ipcMain.handle("engine:cancelStroke", async (_event, payload: CancelStrokeRequest) =>
  engineManager.cancelStroke(payload)
);

function ensurePngFilePath(filePath: string): string {
  if (/\.png$/i.test(filePath)) {
    return filePath;
  }

  const parsed = path.parse(filePath);

  return path.join(parsed.dir, `${parsed.name}.png`);
}
