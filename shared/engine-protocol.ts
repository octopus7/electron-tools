export const ENGINE_TILE_SIZE = 128;

export type EngineStatus = {
  available: boolean;
  detail: string | null;
  binaryPath: string | null;
};

export type StrokeTool = "pencil" | "brush" | "eraser";

export type StrokePoint = {
  x: number;
  y: number;
};

export type StrokeBrushParams = {
  size: number;
  opacity: number;
  flow: number;
  dabSpacing: number;
  color: [number, number, number, number];
};

export type DirtyDisplayTile = {
  documentId: string;
  tileX: number;
  tileY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pixelsBase64: string;
};

export type EngineMutationResult = {
  dirtyDisplayTiles: DirtyDisplayTile[];
  documentDirty: boolean;
};

export type CreateDocumentRequest = {
  documentId: string;
  width: number;
  height: number;
  background: string;
};

export type CloseDocumentRequest = {
  documentId: string;
};

export type BeginStrokeRequest = {
  documentId: string;
  tool: StrokeTool;
  pointerId: number;
  brush: StrokeBrushParams;
  point: StrokePoint;
};

export type AppendStrokePointsRequest = {
  documentId: string;
  pointerId: number;
  points: StrokePoint[];
};

export type EndStrokeRequest = {
  documentId: string;
  pointerId: number;
};

export type CancelStrokeRequest = {
  documentId: string;
  pointerId: number;
};
