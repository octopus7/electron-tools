import type {
  DirtyDisplayTile,
  StrokePoint,
  StrokeTool
} from "../shared/engine-protocol";

export type AppCommand =
  | "file:new"
  | "file:open"
  | "file:save"
  | "file:saveAs"
  | "file:options"
  | "file:exit"
  | "edit:copy"
  | "edit:paste"
  | "help:about";

export type ToolId = "zoom" | StrokeTool;

export type WorkspaceMode = "floating" | "tabbed-maximized";

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorkspaceSize = {
  width: number;
  height: number;
};

export type ToolOptions = {
  size: number;
  opacity: number;
  flow: number;
  dabSpacing: number;
};

export type DocumentSurfaceBootstrap =
  | {
      kind: "blank";
    }
  | {
      kind: "loaded";
      initialDisplayTiles: DirtyDisplayTile[];
    };

export type DocumentModel = {
  id: string;
  title: string;
  width: number;
  height: number;
  background: string;
  filePath: string | null;
  dirty: boolean;
  surfaceBootstrap: DocumentSurfaceBootstrap;
};

export type DocumentWindowState = DocumentModel & {
  frame: Rect;
  zIndex: number;
};

export type RendererStrokeSession = {
  pointerId: number;
  lastPoint: StrokePoint;
  queuedPoints: StrokePoint[];
  rafId: number | null;
};
