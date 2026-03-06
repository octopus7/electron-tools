import { useEffect, useReducer, useRef, useState } from "react";
import { MenuBar } from "./components/MenuBar";
import { TabStrip } from "./components/TabStrip";
import { TitleBar } from "./components/TitleBar";
import { Toolbar } from "./components/Toolbar";
import { Workspace } from "./components/Workspace";
import { appReducer, createInitialState, formatDocumentLabel } from "./state";
import type { AppCommand } from "./types";

type ToastState = {
  id: number;
  message: string;
};

const commandMessages: Record<Exclude<AppCommand, "file:new" | "file:exit">, string> = {
  "file:open": "Open is still a placeholder. Wire this command to file dialogs next.",
  "file:save": "Save is still a placeholder. The Rust document model is ready for persistence next.",
  "file:saveAs": "Save As is still a placeholder.",
  "edit:copy": "Copy is not connected yet.",
  "edit:paste": "Paste is not connected yet.",
  "help:about": "Electron Tools with Rust stroke engine prototype"
};

export default function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialState);
  const [windowMaximized, setWindowMaximized] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastIdRef = useRef(0);
  const commandHandlerRef = useRef<(command: AppCommand) => void>(() => undefined);

  function pushToast(message: string) {
    toastIdRef.current += 1;
    setToast({
      id: toastIdRef.current,
      message
    });
  }

  commandHandlerRef.current = (command: AppCommand) => {
    if (command === "file:new") {
      dispatch({
        type: "create-document"
      });
      return;
    }

    if (command === "file:exit") {
      void window.electronAPI?.window.close();
      return;
    }

    pushToast(commandMessages[command]);
  };

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
      commandHandlerRef.current(command);
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

  const activeDocument =
    state.documents.find((document) => document.id === state.activeDocumentId) ?? null;

  return (
    <div className="app-shell">
      <TitleBar
        activeDocumentLabel={
          activeDocument ? formatDocumentLabel(activeDocument) : "Rust imaging workspace"
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
        onCommand={(command) => {
          commandHandlerRef.current(command);
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
      />

      {toast ? (
        <div className="app-toast" role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
