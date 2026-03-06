import { type PointerEvent as ReactPointerEvent } from "react";
import { CloseIcon, MaximizeIcon } from "../icons";
import { useI18n } from "../i18n";
import { formatDocumentLabel } from "../state";
import type {
  DocumentWindowState,
  StrokeFramePerformanceSample,
  ToolId,
  ToolOptions
} from "../types";
import { DocumentCanvas } from "./DocumentCanvas";

export type ResizeHandle = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";
export type DocumentLayout = "floating" | "maximized" | "hidden";

type DocumentWindowProps = {
  document: DocumentWindowState;
  layout: DocumentLayout;
  isActive: boolean;
  activeTool: ToolId;
  toolOptions: ToolOptions;
  onActivate: (id: string) => void;
  onHeaderPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    document: DocumentWindowState
  ) => void;
  onResizeHandlePointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    document: DocumentWindowState,
    handle: ResizeHandle
  ) => void;
  onClose: (id: string) => void;
  onToggleMaximize: (id: string) => void;
  onMarkDirty: (id: string) => void;
  onPerformanceSample: (sample: StrokeFramePerformanceSample) => void;
};

const resizeHandles: ResizeHandle[] = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];

export function DocumentWindow({
  document,
  layout,
  isActive,
  activeTool,
  toolOptions,
  onActivate,
  onHeaderPointerDown,
  onResizeHandlePointerDown,
  onClose,
  onToggleMaximize,
  onMarkDirty,
  onPerformanceSample
}: DocumentWindowProps) {
  const { t } = useI18n();
  const isFloating = layout === "floating";
  const isHidden = layout === "hidden";
  const windowStyle =
    layout === "maximized"
      ? {
          inset: 0,
          zIndex: 1
        }
      : {
          left: document.frame.x,
          top: document.frame.y,
          width: document.frame.width,
          height: document.frame.height,
          zIndex: document.zIndex
        };

  return (
    <article
      className={`document-window document-window--${layout} ${
        isActive ? "is-active" : ""
      } ${isHidden ? "is-hidden" : ""}`}
      style={windowStyle}
      onPointerDown={() => {
        onActivate(document.id);
      }}
    >
      {isFloating ? (
        <header
          className="document-window__header"
          onPointerDown={(event) => onHeaderPointerDown(event, document)}
          onDoubleClick={() => onToggleMaximize(document.id)}
        >
          <div className="document-window__header-copy">
            <span className="document-window__title">{document.title}</span>
            <span className="document-window__meta">
              {document.width}x{document.height}
            </span>
          </div>

          <div className="document-window__header-actions">
            <button
              type="button"
              className="document-window__header-button"
              aria-label={`${document.title} ${t("document.header.maximize")}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onToggleMaximize(document.id)}
            >
              <MaximizeIcon />
            </button>
            <button
              type="button"
              className="document-window__header-button"
              aria-label={`${document.title} ${t("document.header.close")}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onClose(document.id)}
            >
              <CloseIcon />
            </button>
          </div>
        </header>
      ) : null}

      <div className="document-window__body">
        <div className="document-window__overlay document-window__overlay--top">
          <span>{formatDocumentLabel(document)}</span>
        </div>
        <DocumentCanvas
          documentId={document.id}
          documentTitle={document.title}
          width={document.width}
          height={document.height}
          background={document.background}
          dirty={document.dirty}
          surfaceBootstrap={document.surfaceBootstrap}
          activeTool={activeTool}
          toolOptions={toolOptions}
          onActivate={() => onActivate(document.id)}
          onMarkDirty={onMarkDirty}
          onPerformanceSample={onPerformanceSample}
        />
      </div>

      {isFloating
        ? resizeHandles.map((handle) => (
            <div
              key={handle}
              className={`document-window__resize-handle document-window__resize-handle--${handle}`}
              onPointerDown={(event) => onResizeHandlePointerDown(event, document, handle)}
            />
          ))
        : null}
    </article>
  );
}
