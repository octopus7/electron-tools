import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  DirtyDisplayTile,
  EngineMutationResult,
  StrokeBrushParams,
  StrokePoint
} from "../../shared/engine-protocol";
import { isStrokeTool } from "../state";
import type { RendererStrokeSession, ToolId, ToolOptions } from "../types";

type DocumentCanvasProps = {
  documentId: string;
  width: number;
  height: number;
  background: string;
  dirty: boolean;
  activeTool: ToolId;
  toolOptions: ToolOptions;
  onActivate: () => void;
  onMarkDirty: (id: string) => void;
};

type SurfaceState = {
  ready: boolean;
  detail: string | null;
};

export function DocumentCanvas({
  documentId,
  width,
  height,
  background,
  dirty,
  activeTool,
  toolOptions,
  onActivate,
  onMarkDirty
}: DocumentCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokeRef = useRef<RendererStrokeSession | null>(null);
  const requestChainRef = useRef<Promise<void>>(Promise.resolve());
  const documentVersionRef = useRef(0);
  const dirtyRef = useRef(dirty);
  const [surfaceState, setSurfaceState] = useState<SurfaceState>({
    ready: false,
    detail: "Waiting for Rust engine..."
  });

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    documentVersionRef.current += 1;
    const version = documentVersionRef.current;

    strokeRef.current = null;
    clearStrokeFrameQueue();
    resetCanvas(canvasRef.current, width, height, background);
    setSurfaceState({
      ready: false,
      detail: "Connecting to Rust engine..."
    });

    queueEngineRequest(async () => {
      const api = window.electronAPI;

      if (!api) {
        throw new Error("Electron bridge is unavailable.");
      }

      const status = await api.engine.getStatus();

      if (!status?.available) {
        throw new Error(status?.detail ?? "Rust engine is unavailable.");
      }

      const result = await api.engine.createDocument({
        documentId,
        width,
        height,
        background
      });

      if (documentVersionRef.current !== version) {
        return;
      }

      applyMutationResult(result);
      setSurfaceState({
        ready: true,
        detail: null
      });
    }).catch((error) => {
      if (documentVersionRef.current !== version) {
        return;
      }

      setSurfaceState({
        ready: false,
        detail: error instanceof Error ? error.message : String(error)
      });
    });

    return () => {
      documentVersionRef.current += 1;
      cancelStroke(canvasRef.current);
      void window.electronAPI?.engine
        .closeDocument({
          documentId
        })
        .catch(() => undefined);
    };
  }, [background, documentId, height, width]);

  function queueEngineRequest(task: () => Promise<void>) {
    const next = requestChainRef.current.then(task, task);
    requestChainRef.current = next.catch(() => undefined);

    return next;
  }

  async function sendQueuedPoints(pointerId: number, points: StrokePoint[]) {
    if (points.length === 0) {
      return;
    }

    const result = await window.electronAPI!.engine.appendStrokePoints({
      documentId,
      pointerId,
      points
    });

    applyMutationResult(result);
  }

  function applyMutationResult(result: EngineMutationResult) {
    drawTileUpdates(result.dirtyDisplayTiles);

    if (result.documentDirty && !dirtyRef.current) {
      dirtyRef.current = true;
      onMarkDirty(documentId);
    }
  }

  function drawTileUpdates(updates: DirtyDisplayTile[]) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    for (const update of updates) {
      if (update.documentId !== documentId) {
        continue;
      }

      const bytes = decodeBase64(update.pixelsBase64);
      const imageData = context.createImageData(update.width, update.height);
      imageData.data.set(bytes);
      context.putImageData(imageData, update.x, update.y);
    }
  }

  function beginStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    onActivate();

    if (!canDraw(activeTool) || event.button !== 0 || !surfaceState.ready) {
      return;
    }

    const canvas = canvasRef.current;
    const point = canvas ? getCanvasPoint(event, canvas, width, height) : null;

    if (!canvas || !point) {
      return;
    }

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);

    strokeRef.current = {
      pointerId: event.pointerId,
      lastPoint: point,
      queuedPoints: [],
      rafId: null
    };

    queueEngineRequest(async () => {
      const result = await window.electronAPI!.engine.beginStroke({
        documentId,
        pointerId: event.pointerId,
        tool: activeTool,
        brush: createBrushParams(toolOptions),
        point
      });

      applyMutationResult(result);
    }).catch((error) => {
      setSurfaceState({
        ready: false,
        detail: error instanceof Error ? error.message : String(error)
      });
      cancelStroke(canvas);
    });
  }

  function moveStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const stroke = strokeRef.current;

    if (!stroke || stroke.pointerId !== event.pointerId) {
      return;
    }

    const canvas = canvasRef.current;
    const point = canvas ? getCanvasPoint(event, canvas, width, height) : null;

    if (!point) {
      return;
    }

    stroke.lastPoint = point;
    stroke.queuedPoints.push(point);

    if (stroke.rafId !== null) {
      return;
    }

    stroke.rafId = window.requestAnimationFrame(() => {
      void flushStrokeQueue();
    });
  }

  async function flushStrokeQueue() {
    const stroke = strokeRef.current;

    if (!stroke) {
      return;
    }

    const points = takeQueuedPoints(stroke);

    if (points.length === 0) {
      return;
    }

    await queueEngineRequest(async () => {
      await sendQueuedPoints(stroke.pointerId, points);
    }).catch((error) => {
      setSurfaceState({
        ready: false,
        detail: error instanceof Error ? error.message : String(error)
      });
    });
  }

  function endStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const stroke = strokeRef.current;

    if (!canvas || !stroke || stroke.pointerId !== event.pointerId) {
      return;
    }

    const pointerId = stroke.pointerId;
    const queuedPoints = takeQueuedPoints(stroke);

    if (canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }

    void queueEngineRequest(async () => {
      await sendQueuedPoints(pointerId, queuedPoints);

      const result = await window.electronAPI!.engine.endStroke({
        documentId,
        pointerId
      });

      applyMutationResult(result);
      strokeRef.current = null;
    }).catch((error) => {
      strokeRef.current = null;
      setSurfaceState({
        ready: false,
        detail: error instanceof Error ? error.message : String(error)
      });
    });
  }

  function abortStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const stroke = strokeRef.current;

    if (!canvas || !stroke || stroke.pointerId !== event.pointerId) {
      return;
    }

    if (canvas.hasPointerCapture(stroke.pointerId)) {
      canvas.releasePointerCapture(stroke.pointerId);
    }

    clearStrokeFrameQueue();
    strokeRef.current = null;

    void queueEngineRequest(async () => {
      const result = await window.electronAPI!.engine.cancelStroke({
        documentId,
        pointerId: event.pointerId
      });

      applyMutationResult(result);
    }).catch((error) => {
      setSurfaceState({
        ready: false,
        detail: error instanceof Error ? error.message : String(error)
      });
    });
  }

  function clearStrokeFrameQueue() {
    const stroke = strokeRef.current;

    if (stroke && stroke.rafId !== null) {
      window.cancelAnimationFrame(stroke.rafId);
      stroke.rafId = null;
    }
  }

  function takeQueuedPoints(stroke: RendererStrokeSession): StrokePoint[] {
    if (stroke.rafId !== null) {
      window.cancelAnimationFrame(stroke.rafId);
      stroke.rafId = null;
    }

    if (stroke.queuedPoints.length === 0) {
      return [];
    }

    const points = [...stroke.queuedPoints];
    stroke.queuedPoints.length = 0;

    return points;
  }

  return (
    <div className="document-canvas-shell">
      <canvas
        ref={canvasRef}
        className={`document-canvas ${
          canDraw(activeTool) && surfaceState.ready ? "is-pencil" : "is-inactive-tool"
        }`}
        width={width}
        height={height}
        onPointerDown={beginStroke}
        onPointerMove={moveStroke}
        onPointerUp={endStroke}
        onPointerCancel={abortStroke}
        onLostPointerCapture={() => {
          strokeRef.current = null;
          clearStrokeFrameQueue();
        }}
      />
      {surfaceState.detail ? (
        <div className="document-canvas__status">{surfaceState.detail}</div>
      ) : null}
    </div>
  );
}

function canDraw(tool: ToolId): tool is "pencil" {
  return isStrokeTool(tool) && tool === "pencil";
}

function createBrushParams(toolOptions: ToolOptions): StrokeBrushParams {
  return {
    size: toolOptions.size,
    opacity: toolOptions.opacity,
    flow: toolOptions.flow,
    dabSpacing: toolOptions.dabSpacing,
    color: [16, 20, 27, 255]
  };
}

function getCanvasPoint(
  event: ReactPointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): StrokePoint | null {
  const bounds = canvas.getBoundingClientRect();

  if (bounds.width === 0 || bounds.height === 0) {
    return null;
  }

  const x = Math.floor(((event.clientX - bounds.left) / bounds.width) * width);
  const y = Math.floor(((event.clientY - bounds.top) / bounds.height) * height);

  return {
    x: clamp(x, 0, width - 1),
    y: clamp(y, 0, height - 1)
  };
}

function decodeBase64(value: string): Uint8ClampedArray {
  const binary = window.atob(value);
  const bytes = new Uint8ClampedArray(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function resetCanvas(
  canvas: HTMLCanvasElement | null,
  width: number,
  height: number,
  background: string
) {
  const context = canvas?.getContext("2d");

  if (!canvas || !context) {
    return;
  }

  context.clearRect(0, 0, width, height);
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;
}

function cancelStroke(canvas: HTMLCanvasElement | null) {
  if (!canvas) {
    return;
  }

  for (const pointerId of [0, 1, 2, 3, 4]) {
    if (canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
