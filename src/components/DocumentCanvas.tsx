import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { PencilStrokeState, ToolId, ToolOptions } from "../types";

type DocumentCanvasProps = {
  documentId: string;
  width: number;
  height: number;
  background: string;
  dirty: boolean;
  activeTool: ToolId;
  toolOptions: ToolOptions;
  isActive: boolean;
  onActivate: () => void;
  onMarkDirty: (id: string) => void;
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
  const strokeRef = useRef<PencilStrokeState | null>(null);
  const dirtyRef = useRef(dirty);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.imageSmoothingEnabled = false;

    if (canvas.dataset.documentId === documentId) {
      return;
    }

    context.clearRect(0, 0, width, height);
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    canvas.dataset.documentId = documentId;
    dirtyRef.current = dirty;
  }, [background, dirty, documentId, height, width]);

  function beginStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    onActivate();

    if (activeTool !== "pencil" || event.button !== 0) {
      return;
    }

    event.preventDefault();

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const point = getCanvasPoint(event, canvas, width, height);

    if (!point) {
      return;
    }

    canvas.setPointerCapture(event.pointerId);
    strokeRef.current = {
      active: true,
      pointerId: event.pointerId,
      lastPoint: point
    };

    drawStamp(context, point.x, point.y, toolOptions.size, toolOptions.opacity);
    markDocumentDirty();
  }

  function moveStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const stroke = strokeRef.current;

    if (!stroke || !stroke.active || stroke.pointerId !== event.pointerId) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const point = getCanvasPoint(event, canvas, width, height);

    if (!point) {
      return;
    }

    drawLine(
      context,
      stroke.lastPoint.x,
      stroke.lastPoint.y,
      point.x,
      point.y,
      toolOptions.size,
      toolOptions.opacity
    );
    strokeRef.current = {
      ...stroke,
      lastPoint: point
    };
    markDocumentDirty();
  }

  function endStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const stroke = strokeRef.current;

    if (canvas && stroke && stroke.pointerId === event.pointerId) {
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }

      strokeRef.current = null;
    }
  }

  function markDocumentDirty() {
    if (dirtyRef.current) {
      return;
    }

    dirtyRef.current = true;
    onMarkDirty(documentId);
  }

  return (
    <div className="document-canvas-shell">
      <canvas
        ref={canvasRef}
        className={`document-canvas ${
          activeTool === "pencil" ? "is-pencil" : "is-inactive-tool"
        }`}
        width={width}
        height={height}
        onPointerDown={beginStroke}
        onPointerMove={moveStroke}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onLostPointerCapture={() => {
          strokeRef.current = null;
        }}
      />
    </div>
  );
}

function getCanvasPoint(
  event: ReactPointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
  width: number,
  height: number
) {
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

function drawLine(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  size: number,
  opacity: number
) {
  let currentX = startX;
  let currentY = startY;
  const deltaX = Math.abs(endX - startX);
  const deltaY = Math.abs(endY - startY);
  const stepX = startX < endX ? 1 : -1;
  const stepY = startY < endY ? 1 : -1;
  let error = deltaX - deltaY;

  while (true) {
    drawStamp(context, currentX, currentY, size, opacity);

    if (currentX === endX && currentY === endY) {
      break;
    }

    const errorTwice = error * 2;

    if (errorTwice > -deltaY) {
      error -= deltaY;
      currentX += stepX;
    }

    if (errorTwice < deltaX) {
      error += deltaX;
      currentY += stepY;
    }
  }
}

function drawStamp(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  size: number,
  opacity: number
) {
  const stampSize = Math.max(1, Math.round(size));
  const originOffset = Math.floor(stampSize / 2);
  const alpha = clamp(opacity, 1, 100) / 100;

  context.fillStyle = `rgba(16, 20, 27, ${alpha})`;
  context.fillRect(
    Math.round(centerX) - originOffset,
    Math.round(centerY) - originOffset,
    stampSize,
    stampSize
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
