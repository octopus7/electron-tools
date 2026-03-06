import { useEffect, useRef } from "react";
import type {
  DocumentWindowState,
  Rect,
  ToolId,
  ToolOptions,
  WorkspaceMode,
  WorkspaceSize
} from "../types";
import { DocumentWindow, type ResizeHandle } from "./DocumentWindow";

type WorkspaceProps = {
  documents: DocumentWindowState[];
  activeDocumentId: string | null;
  workspaceMode: WorkspaceMode;
  activeTool: ToolId;
  toolOptions: ToolOptions;
  onWorkspaceResize: (size: WorkspaceSize) => void;
  onActivateDocument: (id: string) => void;
  onUpdateDocumentFrame: (id: string, frame: Rect) => void;
  onToggleMaximize: (id: string) => void;
  onCloseDocument: (id: string) => void;
  onMarkDirty: (id: string) => void;
};

type InteractionState =
  | {
      kind: "move";
      documentId: string;
      startPointer: {
        x: number;
        y: number;
      };
      startFrame: Rect;
    }
  | {
      kind: "resize";
      documentId: string;
      handle: ResizeHandle;
      startPointer: {
        x: number;
        y: number;
      };
      startFrame: Rect;
    };

export function Workspace({
  documents,
  activeDocumentId,
  workspaceMode,
  activeTool,
  toolOptions,
  onWorkspaceResize,
  onActivateDocument,
  onUpdateDocumentFrame,
  onToggleMaximize,
  onCloseDocument,
  onMarkDirty
}: WorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<InteractionState | null>(null);
  const lastSizeRef = useRef<WorkspaceSize>({
    width: 0,
    height: 0
  });

  useEffect(() => {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextSize = {
        width: Math.floor(entries[0].contentRect.width),
        height: Math.floor(entries[0].contentRect.height)
      };

      if (
        nextSize.width === lastSizeRef.current.width &&
        nextSize.height === lastSizeRef.current.height
      ) {
        return;
      }

      lastSizeRef.current = nextSize;
      onWorkspaceResize(nextSize);
    });

    observer.observe(workspace);

    return () => {
      observer.disconnect();
    };
  }, [onWorkspaceResize]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const interaction = interactionRef.current;

      if (!interaction) {
        return;
      }

      const deltaX = event.clientX - interaction.startPointer.x;
      const deltaY = event.clientY - interaction.startPointer.y;

      if (interaction.kind === "move") {
        onUpdateDocumentFrame(interaction.documentId, {
          ...interaction.startFrame,
          x: interaction.startFrame.x + deltaX,
          y: interaction.startFrame.y + deltaY
        });
        return;
      }

      onUpdateDocumentFrame(
        interaction.documentId,
        resizeFrame(interaction.startFrame, deltaX, deltaY, interaction.handle)
      );
    }

    function endInteraction() {
      interactionRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endInteraction);
    window.addEventListener("pointercancel", endInteraction);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endInteraction);
      window.removeEventListener("pointercancel", endInteraction);
    };
  }, [onUpdateDocumentFrame]);

  const orderedDocuments = [...documents].sort((left, right) => left.zIndex - right.zIndex);

  return (
    <section className={`workspace workspace--${workspaceMode}`} ref={workspaceRef}>
      {documents.length === 0 ? (
        <div className="workspace__empty-state">
          <strong>문서가 없습니다.</strong>
          <p>파일 &gt; 새로 만들기 또는 Ctrl+N으로 새 문서를 여세요.</p>
        </div>
      ) : null}

      {orderedDocuments.map((document) => {
        const layout =
          workspaceMode === "tabbed-maximized"
            ? document.id === activeDocumentId
              ? "maximized"
              : "hidden"
            : "floating";

        return (
          <DocumentWindow
            key={document.id}
            document={document}
            layout={layout}
            isActive={document.id === activeDocumentId}
            activeTool={activeTool}
            toolOptions={toolOptions}
            onActivate={onActivateDocument}
            onHeaderPointerDown={(event, activeDocument) => {
              if (workspaceMode !== "floating") {
                return;
              }

              event.preventDefault();
              onActivateDocument(activeDocument.id);
              interactionRef.current = {
                kind: "move",
                documentId: activeDocument.id,
                startPointer: {
                  x: event.clientX,
                  y: event.clientY
                },
                startFrame: activeDocument.frame
              };
            }}
            onResizeHandlePointerDown={(event, activeDocument, handle) => {
              if (workspaceMode !== "floating") {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              onActivateDocument(activeDocument.id);
              interactionRef.current = {
                kind: "resize",
                documentId: activeDocument.id,
                handle,
                startPointer: {
                  x: event.clientX,
                  y: event.clientY
                },
                startFrame: activeDocument.frame
              };
            }}
            onClose={onCloseDocument}
            onToggleMaximize={onToggleMaximize}
            onMarkDirty={onMarkDirty}
          />
        );
      })}
    </section>
  );
}

function resizeFrame(frame: Rect, deltaX: number, deltaY: number, handle: ResizeHandle): Rect {
  let nextFrame = {
    ...frame
  };

  if (handle.includes("e")) {
    nextFrame.width += deltaX;
  }

  if (handle.includes("s")) {
    nextFrame.height += deltaY;
  }

  if (handle.includes("w")) {
    nextFrame.x += deltaX;
    nextFrame.width -= deltaX;
  }

  if (handle.includes("n")) {
    nextFrame.y += deltaY;
    nextFrame.height -= deltaY;
  }

  return nextFrame;
}
