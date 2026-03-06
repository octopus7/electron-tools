import { useEffect, useReducer, useRef, useState } from "react";
import { MenuBar } from "./components/MenuBar";
import { PerformancePanel } from "./components/PerformancePanel";
import { SettingsDialog } from "./components/SettingsDialog";
import { TabStrip } from "./components/TabStrip";
import { TitleBar } from "./components/TitleBar";
import { Toolbar } from "./components/Toolbar";
import { Workspace } from "./components/Workspace";
import {
  I18nProvider,
  getInitialLocale,
  normalizeLocale,
  persistLocale,
  readStoredLocale,
  useI18n,
  type AppLocale
} from "./i18n";
import { appReducer, createInitialState, formatDocumentLabel } from "./state";
import {
  applyTheme,
  getInitialTheme,
  getSystemTheme,
  persistTheme,
  readStoredTheme,
  type AppTheme
} from "./theme";
import type { AppCommand, DocumentWindowState, StrokeFramePerformanceSample } from "./types";

type ToastState = {
  id: number;
  message: string;
};

const PERFORMANCE_HISTORY_LIMIT = 132;

export default function App() {
  const [locale, setLocale] = useState<AppLocale>(() => getInitialLocale());
  const [theme, setTheme] = useState<AppTheme>(() => getInitialTheme());

  useEffect(() => {
    if (readStoredLocale()) {
      return;
    }

    let disposed = false;

    void window.electronAPI?.system
      .getLocale()
      .then((systemLocale) => {
        if (!disposed) {
          setLocale(normalizeLocale(systemLocale));
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (readStoredTheme() || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => {
      setTheme(getSystemTheme());
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return (
    <I18nProvider
      locale={locale}
      onLocaleChange={(nextLocale) => {
        persistLocale(nextLocale);
        setLocale(nextLocale);
      }}
    >
      <AppShell
        theme={theme}
        onThemeChange={(nextTheme) => {
          persistTheme(nextTheme);
          setTheme(nextTheme);
        }}
      />
    </I18nProvider>
  );
}

function AppShell({
  theme,
  onThemeChange
}: {
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}) {
  const { locale, setLocale, t } = useI18n();
  const [state, dispatch] = useReducer(
    appReducer,
    {
      defaultDocumentTitle: t("document.defaultTitle", {
        number: 1
      })
    },
    createInitialState
  );
  const [windowMaximized, setWindowMaximized] = useState(false);
  const [performancePanelOpen, setPerformancePanelOpen] = useState(false);
  const [latestPerformanceSample, setLatestPerformanceSample] =
    useState<StrokeFramePerformanceSample | null>(null);
  const [performanceHistory, setPerformanceHistory] = useState<StrokeFramePerformanceSample[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastIdRef = useRef(0);
  const commandHandlerRef = useRef<(command: AppCommand) => Promise<void>>(async () => undefined);
  const activeDocument =
    state.documents.find((document) => document.id === state.activeDocumentId) ?? null;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function pushToast(message: string) {
    toastIdRef.current += 1;
    setToast({
      id: toastIdRef.current,
      message
    });
  }

  commandHandlerRef.current = async (command: AppCommand) => {
    if (command === "file:new") {
      dispatch({
        type: "create-document",
        title: t("document.defaultTitle", {
          number: state.nextDocumentNumber
        })
      });
      return;
    }

    if (command === "file:open") {
      const api = getElectronApi();
      const filePath = await api.dialogs.openPng({
        title: t("dialog.openPng.title"),
        filterName: t("dialog.pngFilter")
      });

      if (!filePath) {
        return;
      }

      const result = await api.engine.loadPng({
        documentId: createRendererDocumentId(),
        path: filePath
      });

      dispatch({
        type: "open-document",
        document: {
          id: result.documentId,
          title: result.title,
          width: result.width,
          height: result.height,
          filePath: result.filePath,
          initialDisplayTiles: result.dirtyDisplayTiles
        }
      });
      return;
    }

    if (command === "file:save" || command === "file:saveAs") {
      if (!activeDocument) {
        pushToast(t("toast.noActiveDocument"));
        return;
      }

      const api = getElectronApi();
      const shouldPrompt = command === "file:saveAs" || !activeDocument.filePath;
      const chosenPath = shouldPrompt
        ? await api.dialogs.savePng(buildDefaultSavePath(activeDocument), {
            title: t("dialog.savePng.title"),
            filterName: t("dialog.pngFilter")
          })
        : activeDocument.filePath;

      if (!chosenPath) {
        return;
      }

      const result = await api.engine.savePng({
        documentId: activeDocument.id,
        path: chosenPath
      });

      dispatch({
        type: "sync-document-file",
        id: result.documentId,
        title: result.title,
        filePath: result.filePath,
        dirty: result.documentDirty
      });
      pushToast(
        t("toast.saved", {
          title: result.title
        })
      );
      return;
    }

    if (command === "file:options") {
      setSettingsOpen(true);
      return;
    }

    if (command === "file:exit") {
      await window.electronAPI?.window.close();
      return;
    }

    if (command === "edit:copy") {
      pushToast(t("toast.copyPlaceholder"));
      return;
    }

    if (command === "edit:paste") {
      pushToast(t("toast.pastePlaceholder"));
      return;
    }

    if (command === "view:togglePerformance") {
      setPerformancePanelOpen((current) => !current);
      return;
    }

    pushToast(t("toast.about"));
  };

  function executeCommand(command: AppCommand) {
    void commandHandlerRef.current(command).catch((error) => {
      pushToast(getErrorMessage(error));
    });
  }

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    let disposed = false;

    void window.electronAPI.window.getState().then((stateSnapshot) => {
      if (!disposed) {
        setWindowMaximized(stateSnapshot.isMaximized);
      }
    });

    const unsubscribeWindowState = window.electronAPI.window.onStateChange((stateSnapshot) => {
      setWindowMaximized(stateSnapshot.isMaximized);
    });
    const unsubscribeCommands = window.electronAPI.commands.onExecute((command) => {
      executeCommand(command);
    });

    return () => {
      disposed = true;
      unsubscribeWindowState();
      unsubscribeCommands();
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast((currentToast) => (currentToast?.id === toast.id ? null : currentToast));
    }, 2800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  return (
    <div className="app-shell" data-theme={theme}>
      <TitleBar
        activeDocumentLabel={
          activeDocument ? formatDocumentLabel(activeDocument) : t("app.workspaceFallback")
        }
        isWindowMaximized={windowMaximized}
        onMinimize={() => {
          void window.electronAPI?.window.minimize();
        }}
        onToggleMaximize={() => {
          void window.electronAPI?.window.toggleMaximize();
        }}
        onClose={() => {
          void window.electronAPI?.window.close();
        }}
      />

      <MenuBar
        checkedCommands={{
          "view:togglePerformance": performancePanelOpen
        }}
        onCommand={(command) => {
          executeCommand(command);
        }}
      />

      <Toolbar
        activeTool={state.activeTool}
        toolOptions={state.toolOptions}
        onSelectTool={(tool) => {
          dispatch({
            type: "select-tool",
            tool
          });
        }}
        onChangeOption={(key, value) => {
          dispatch({
            type: "set-tool-option",
            key,
            value
          });
        }}
      />

      {state.workspaceMode === "tabbed-maximized" ? (
        <TabStrip
          documents={state.documents}
          activeDocumentId={state.activeDocumentId}
          onSelect={(id) => {
            dispatch({
              type: "select-tab",
              id
            });
          }}
          onClose={(id) => {
            dispatch({
              type: "close-document",
              id
            });
          }}
          onRestore={() => {
            if (!state.activeDocumentId) {
              return;
            }

            dispatch({
              type: "toggle-document-maximize",
              id: state.activeDocumentId
            });
          }}
        />
      ) : null}

      <Workspace
        documents={state.documents}
        activeDocumentId={state.activeDocumentId}
        workspaceMode={state.workspaceMode}
        activeTool={state.activeTool}
        toolOptions={state.toolOptions}
        onWorkspaceResize={(size) => {
          dispatch({
            type: "set-workspace-size",
            size
          });
        }}
        onActivateDocument={(id) => {
          dispatch({
            type: "activate-document",
            id
          });
        }}
        onUpdateDocumentFrame={(id, frame) => {
          dispatch({
            type: "update-document-frame",
            id,
            frame
          });
        }}
        onToggleMaximize={(id) => {
          dispatch({
            type: "toggle-document-maximize",
            id
          });
        }}
        onCloseDocument={(id) => {
          dispatch({
            type: "close-document",
            id
          });
        }}
        onMarkDirty={(id) => {
          dispatch({
            type: "mark-document-dirty",
            id,
            dirty: true
          });
        }}
        onPerformanceSample={(sample) => {
          setLatestPerformanceSample(sample);
          setPerformanceHistory((current) => {
            const next = [...current, sample];

            return next.length > PERFORMANCE_HISTORY_LIMIT
              ? next.slice(next.length - PERFORMANCE_HISTORY_LIMIT)
              : next;
          });
        }}
      />

      {performancePanelOpen ? (
        <PerformancePanel
          sample={latestPerformanceSample}
          history={performanceHistory}
          onClose={() => {
            setPerformancePanelOpen(false);
          }}
        />
      ) : null}

      <SettingsDialog
        open={settingsOpen}
        locale={locale}
        theme={theme}
        onLocaleChange={setLocale}
        onThemeChange={onThemeChange}
        onClose={() => {
          setSettingsOpen(false);
        }}
      />

      {toast ? (
        <div className="app-toast" role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

function getElectronApi() {
  if (!window.electronAPI) {
    throw new Error("Electron bridge is unavailable.");
  }

  return window.electronAPI;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createRendererDocumentId(): string {
  if ("randomUUID" in crypto) {
    return `document-${crypto.randomUUID()}`;
  }

  return `document-${Math.random().toString(36).slice(2, 10)}`;
}

function buildDefaultSavePath(document: DocumentWindowState): string {
  if (document.filePath) {
    return document.filePath;
  }

  return `${sanitizeFileStem(document.title)}.png`;
}

function sanitizeFileStem(value: string): string {
  const trimmed = value.trim().replace(/\.png$/i, "");
  const sanitized = trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");

  return sanitized || "Untitled";
}
