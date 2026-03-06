import type {
  DirtyDisplayTile,
  EngineFramePerformance,
  EnginePerformanceStageKey,
  StrokePoint,
  StrokeFramePhase,
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
  | "view:togglePerformance"
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
      initialPixelPayload: ArrayBuffer | null;
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

export type RendererPerformanceStageKey = "mainTransfer" | "rendererUpload" | "framePresent";

export type PerformanceStageKey = EnginePerformanceStageKey | RendererPerformanceStageKey;

export type StrokeFramePerformanceSample = {
  documentId: string;
  documentTitle: string;
  phase: StrokeFramePhase;
  stageTimings: Array<{
    key: PerformanceStageKey;
    durationMs: number;
  }>;
  engineTotalMs: number;
  frameTimeMs: number;
  fps: number;
  dirtyTileCount: number;
  updatedAt: number;
};

export type TimingMetricKey =
  | "frameTimeMs"
  | "engineTotalMs"
  | "strokeInput"
  | "strokeCommit"
  | "displayTiles"
  | "responsePack"
  | "mainTransfer"
  | "rendererUpload"
  | "framePresent";

export type MutationPerformanceContext = {
  documentId: string;
  documentTitle: string;
};

export function toStrokeFramePerformanceSample(
  context: MutationPerformanceContext,
  performance: EngineFramePerformance,
  mainTransferMs: number,
  rendererUploadMs: number,
  framePresentMs: number,
  frameTimeMs: number,
  dirtyTileCount: number
): StrokeFramePerformanceSample {
  return {
    documentId: context.documentId,
    documentTitle: context.documentTitle,
    phase: performance.phase,
    stageTimings: [
      ...performance.stageTimings,
      {
        key: "mainTransfer",
        durationMs: mainTransferMs
      },
      {
        key: "rendererUpload",
        durationMs: rendererUploadMs
      },
      {
        key: "framePresent",
        durationMs: framePresentMs
      }
    ],
    engineTotalMs: performance.engineTotalMs,
    frameTimeMs,
    fps: frameTimeMs > 0 ? 1000 / frameTimeMs : 0,
    dirtyTileCount,
    updatedAt: Date.now()
  };
}
