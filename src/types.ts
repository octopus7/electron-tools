export type AppCommand =
  | "file:new"
  | "file:open"
  | "file:save"
  | "file:saveAs"
  | "file:exit"
  | "edit:copy"
  | "edit:paste"
  | "help:about";

export type ToolId = "zoom" | "pencil" | "brush" | "eraser";

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

export type DocumentModel = {
  id: string;
  title: string;
  width: number;
  height: number;
  background: string;
  dirty: boolean;
};

export type DocumentWindowState = DocumentModel & {
  frame: Rect;
  zIndex: number;
};

export type PencilStrokeState = {
  active: boolean;
  lastPoint: {
    x: number;
    y: number;
  };
  pointerId: number;
};
