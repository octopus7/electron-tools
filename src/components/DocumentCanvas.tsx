import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent
} from "react";
import type {
  DirtyDisplayTile,
  EngineMutationResult,
  StrokeBrushParams,
  StrokePoint
} from "../../shared/engine-protocol";
import { useI18n } from "../i18n";
import { isStrokeTool } from "../state";
import type {
  DocumentSurfaceBootstrap,
  MutationPerformanceContext,
  RendererStrokeSession,
  StrokeFramePerformanceSample,
  ToolId,
  ToolOptions
} from "../types";
import { toStrokeFramePerformanceSample } from "../types";
import type { ViewportBackend } from "../viewport";
import { WebGL2ViewportBackend } from "../viewport/webgl2";

type DocumentCanvasProps = {
  documentId: string;
  documentTitle: string;
  width: number;
  height: number;
  background: string;
  dirty: boolean;
  surfaceBootstrap: DocumentSurfaceBootstrap;
  activeTool: ToolId;
  toolOptions: ToolOptions;
  onActivate: () => void;
  onMarkDirty: (id: string) => void;
  onPerformanceSample: (sample: StrokeFramePerformanceSample) => void;
};

type SurfaceState = {
  ready: boolean;
  detail: string | null;
};

export function DocumentCanvas({
  documentId,
  documentTitle,
  width,
  height,
  background,
  dirty,
  surfaceBootstrap,
  activeTool,
  toolOptions,
  onActivate,
  onMarkDirty,
  onPerformanceSample
}: DocumentCanvasProps) {
  const { t } = useI18n();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backendRef = useRef<ViewportBackend | null>(null);
  const strokeRef = useRef<RendererStrokeSession | null>(null);
  const requestChainRef = useRef<Promise<void>>(Promise.resolve());
  const documentVersionRef = useRef(0);
  const dirtyRef = useRef(dirty);
  const markDirtyRef = useRef(onMarkDirty);
  const performanceSampleRef = useRef(onPerformanceSample);
  const [surfaceState, setSurfaceState] = useState<SurfaceState>({
    ready: false,
    detail: t("canvas.status.waitingEngine")
  });

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    markDirtyRef.current = onMarkDirty;
  }, [onMarkDirty]);

  useEffect(() => {
    performanceSampleRef.current = onPerformanceSample;
  }, [onPerformanceSample]);

  useEffect(() => {
    const shell = shellRef.current;
    const canvas = canvasRef.current;

    if (!shell || !canvas) {
      return;
    }

    documentVersionRef.current += 1;
    const version = documentVersionRef.current;

    strokeRef.current = null;
    clearStrokeFrameQueue(strokeRef);
    backendRef.current?.dispose();
    backendRef.current = null;

    let backend: ViewportBackend;

    try {
      backend = new WebGL2ViewportBackend(canvas);
      backend.replaceDocumentSurface(width, height);
      resizeViewport(shell, backend);
      backendRef.current = backend;
    } catch (error) {
      setSurfaceState({
        ready: false,
        detail: error instanceof Error ? error.message : String(error)
      });

      return;
    }

    if (surfaceBootstrap.kind === "loaded") {
      try {
        uploadTileUpdates(
          backend,
          documentId,
          surfaceBootstrap.initialDisplayTiles,
          surfaceBootstrap.initialPixelPayload
        );
        setSurfaceState({
          ready: true,
          detail: null
        });
      } catch (error) {
        setSurfaceState({
          ready: false,
          detail: error instanceof Error ? error.message : String(error)
        });
      }
    } else {
      setSurfaceState({
        ready: false,
        detail: t("canvas.status.connectingEngine")
      });

      queueEngineRequest(requestChainRef, async () => {
        const api = window.electronAPI;

        if (!api) {
          throw new Error(t("error.bridgeUnavailable"));
        }

        const status = await api.engine.getStatus();

        if (!status?.available) {
          throw new Error(status?.detail ?? t("error.engineUnavailable"));
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

        applyMutationResult(documentId, backend, dirtyRef, markDirtyRef, result);
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
    }

    return () => {
      documentVersionRef.current += 1;
      cancelStroke(canvas);
      backendRef.current?.dispose();
      backendRef.current = null;
      void window.electronAPI?.engine
        .closeDocument({
          documentId
        })
        .catch(() => undefined);
    };
  }, [background, documentId, height, surfaceBootstrap, t, width]);

  useEffect(() => {
    const shell = shellRef.current;

    if (!shell) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (!backendRef.current) {
        return;
      }

      resizeViewport(shell, backendRef.current);
    });

    observer.observe(shell);
    const handleWindowResize = () => {
      if (!backendRef.current) {
        return;
      }

      resizeViewport(shell, backendRef.current);
    };

    window.addEventListener("resize", handleWindowResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleWindowResize);
    };
  }, []);

  async function requestQueuedPoints(pointerId: number, points: StrokePoint[]) {
    if (points.length === 0) {
      return null;
    }

    return window.electronAPI!.engine.appendStrokePoints({
      documentId,
      pointerId,
      points
    });
  }

  function applyMeasuredMutationResult(
    context: MutationPerformanceContext,
    frameStartedAt: number,
    resultReceivedAt: number,
    result: EngineMutationResult
  ) {
    const backend = backendRef.current;

    if (!backend) {
      throw new Error("Viewport backend is unavailable.");
    }

    const rendererUploadStartedAt = performance.now();

    applyMutationResult(documentId, backend, dirtyRef, markDirtyRef, result);

    const rendererUploadEndedAt = performance.now();
    const rendererUploadMs = rendererUploadEndedAt - rendererUploadStartedAt;

    if (!result.framePerformance) {
      return;
    }

    const framePerformance = result.framePerformance;
    const mainTransferMs = Math.max(
      0,
      resultReceivedAt - frameStartedAt - framePerformance.engineTotalMs
    );

    void waitForNextFrame().then(() => {
      const framePresentedAt = performance.now();

      performanceSampleRef.current(
        toStrokeFramePerformanceSample(
          context,
          framePerformance,
          mainTransferMs,
          rendererUploadMs,
          framePresentedAt - rendererUploadEndedAt,
          framePresentedAt - frameStartedAt,
          result.dirtyDisplayTiles.length
        )
      );
    });
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

    queueEngineRequest(requestChainRef, async () => {
      const frameStartedAt = performance.now();
      const result = await window.electronAPI!.engine.beginStroke({
        documentId,
        pointerId: event.pointerId,
        tool: activeTool,
        brush: createBrushParams(toolOptions),
        point
      });
      const resultReceivedAt = performance.now();

      applyMeasuredMutationResult(
        {
          documentId,
          documentTitle
        },
        frameStartedAt,
        resultReceivedAt,
        result
      );
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

    await queueEngineRequest(requestChainRef, async () => {
      const frameStartedAt = performance.now();
      const result = await requestQueuedPoints(stroke.pointerId, points);

      if (!result) {
        return;
      }

      const resultReceivedAt = performance.now();

      applyMeasuredMutationResult(
        {
          documentId,
          documentTitle
        },
        frameStartedAt,
        resultReceivedAt,
        result
      );
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

    void queueEngineRequest(requestChainRef, async () => {
      if (queuedPoints.length > 0) {
        const appendFrameStartedAt = performance.now();
        const appendResult = await requestQueuedPoints(pointerId, queuedPoints);

        if (appendResult) {
          const appendResultReceivedAt = performance.now();

          applyMeasuredMutationResult(
            {
              documentId,
              documentTitle
            },
            appendFrameStartedAt,
            appendResultReceivedAt,
            appendResult
          );
        }
      }

      const frameStartedAt = performance.now();
      const result = await window.electronAPI!.engine.endStroke({
        documentId,
        pointerId
      });
      const resultReceivedAt = performance.now();

      applyMeasuredMutationResult(
        {
          documentId,
          documentTitle
        },
        frameStartedAt,
        resultReceivedAt,
        result
      );
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

    clearStrokeFrameQueue(strokeRef);
    strokeRef.current = null;

    void queueEngineRequest(requestChainRef, async () => {
      const frameStartedAt = performance.now();
      const result = await window.electronAPI!.engine.cancelStroke({
        documentId,
        pointerId: event.pointerId
      });
      const resultReceivedAt = performance.now();

      applyMeasuredMutationResult(
        {
          documentId,
          documentTitle
        },
        frameStartedAt,
        resultReceivedAt,
        result
      );
    }).catch((error) => {
      setSurfaceState({
        ready: false,
        detail: error instanceof Error ? error.message : String(error)
      });
    });
  }

  return (
    <div ref={shellRef} className="document-canvas-shell">
      <canvas
        ref={canvasRef}
        className={`document-canvas ${
          canDraw(activeTool) && surfaceState.ready ? "is-pencil" : "is-inactive-tool"
        }`}
        onPointerDown={beginStroke}
        onPointerMove={moveStroke}
        onPointerUp={endStroke}
        onPointerCancel={abortStroke}
        onLostPointerCapture={() => {
          strokeRef.current = null;
          clearStrokeFrameQueue(strokeRef);
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

function queueEngineRequest(
  requestChainRef: MutableRefObject<Promise<void>>,
  task: () => Promise<void>
) {
  const next = requestChainRef.current.then(task, task);
  requestChainRef.current = next.catch(() => undefined);

  return next;
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      resolve();
    });
  });
}

function applyMutationResult(
  documentId: string,
  backend: ViewportBackend,
  dirtyRef: MutableRefObject<boolean>,
  markDirtyRef: MutableRefObject<(id: string) => void>,
  result: EngineMutationResult
) {
  uploadTileUpdates(backend, documentId, result.dirtyDisplayTiles, result.pixelPayload);

  if (result.documentDirty && !dirtyRef.current) {
    dirtyRef.current = true;
    markDirtyRef.current(documentId);
  }
}

function uploadTileUpdates(
  backend: ViewportBackend,
  documentId: string,
  updates: DirtyDisplayTile[],
  pixelPayload: ArrayBuffer | null
) {
  const documentUpdates = updates.filter((update) => update.documentId === documentId);

  if (documentUpdates.length === 0) {
    return;
  }

  backend.uploadTiles(documentUpdates, pixelPayload);
}

function resizeViewport(shell: HTMLDivElement, backend: ViewportBackend) {
  backend.resize(shell.clientWidth, shell.clientHeight, window.devicePixelRatio || 1);
}

function getCanvasPoint(
  event: ReactPointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): StrokePoint | null {
  const bounds = canvas.getBoundingClientRect();
  const displayRect = getFittedDocumentRect(bounds.width, bounds.height, width, height);

  if (displayRect.width <= 0 || displayRect.height <= 0) {
    return null;
  }

  const localX = event.clientX - bounds.left - displayRect.x;
  const localY = event.clientY - bounds.top - displayRect.y;

  if (
    localX < 0 ||
    localY < 0 ||
    localX >= displayRect.width ||
    localY >= displayRect.height
  ) {
    return null;
  }

  const x = Math.floor((localX / displayRect.width) * width);
  const y = Math.floor((localY / displayRect.height) * height);

  return {
    x: clamp(x, 0, width - 1),
    y: clamp(y, 0, height - 1)
  };
}

function getFittedDocumentRect(
  containerWidth: number,
  containerHeight: number,
  documentWidth: number,
  documentHeight: number
) {
  const scale = Math.min(containerWidth / documentWidth, containerHeight / documentHeight);
  const width = documentWidth * scale;
  const height = documentHeight * scale;

  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height
  };
}

function clearStrokeFrameQueue(strokeRef: MutableRefObject<RendererStrokeSession | null>) {
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
