import type { DirtyDisplayTile } from "../shared/engine-protocol";
import type {
  DocumentWindowState,
  Rect,
  ToolId,
  ToolOptions,
  WorkspaceMode,
  WorkspaceSize
} from "./types";

const DEFAULT_IMAGE_WIDTH = 640;
const DEFAULT_IMAGE_HEIGHT = 480;
const DEFAULT_FRAME_WIDTH = 760;
const DEFAULT_FRAME_HEIGHT = 560;
const MIN_FRAME_WIDTH = 320;
const MIN_FRAME_HEIGHT = 240;
const TOOL_OPTION_LIMITS = {
  size: { min: 1, max: 200 },
  opacity: { min: 1, max: 100 },
  flow: { min: 1, max: 100 },
  dabSpacing: { min: 1, max: 100 }
} as const;

export type AppState = {
  activeTool: ToolId;
  toolOptions: ToolOptions;
  documents: DocumentWindowState[];
  activeDocumentId: string | null;
  workspaceMode: WorkspaceMode;
  workspaceSize: WorkspaceSize;
  nextDocumentNumber: number;
  nextZIndex: number;
};

export type AppAction =
  | {
      type: "select-tool";
      tool: ToolId;
    }
  | {
      type: "set-tool-option";
      key: keyof ToolOptions;
      value: number;
    }
  | {
      type: "create-document";
      title: string;
    }
  | {
      type: "open-document";
      document: {
        id: string;
        title: string;
        width: number;
        height: number;
        filePath: string;
        initialDisplayTiles: DirtyDisplayTile[];
        initialPixelPayload: ArrayBuffer | null;
      };
    }
  | {
      type: "activate-document";
      id: string;
    }
  | {
      type: "update-document-frame";
      id: string;
      frame: Rect;
    }
  | {
      type: "toggle-document-maximize";
      id: string;
    }
  | {
      type: "select-tab";
      id: string;
    }
  | {
      type: "close-document";
      id: string;
    }
  | {
      type: "set-workspace-size";
      size: WorkspaceSize;
    }
  | {
      type: "mark-document-dirty";
      id: string;
      dirty: boolean;
    }
  | {
      type: "sync-document-file";
      id: string;
      title: string;
      filePath: string;
      dirty: boolean;
    };

export function createInitialState(initialState: {
  defaultDocumentTitle: string;
}): AppState {
  const firstDocument = createDocument(1, { width: 0, height: 0 }, 1, initialState.defaultDocumentTitle);

  return {
    activeTool: "pencil",
    toolOptions: {
      size: 1,
      opacity: 100,
      flow: 100,
      dabSpacing: 12
    },
    documents: [firstDocument],
    activeDocumentId: firstDocument.id,
    workspaceMode: "floating",
    workspaceSize: {
      width: 0,
      height: 0
    },
    nextDocumentNumber: 2,
    nextZIndex: 2
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "select-tool":
      return {
        ...state,
        activeTool: action.tool
      };
    case "set-tool-option":
      return {
        ...state,
        toolOptions: {
          ...state.toolOptions,
          [action.key]: clampToolOption(action.key, action.value)
        }
      };
    case "create-document": {
      const nextDocument = createDocument(
        state.nextDocumentNumber,
        state.workspaceSize,
        state.nextZIndex,
        action.title
      );

      return {
        ...state,
        documents: [...state.documents, nextDocument],
        activeDocumentId: nextDocument.id,
        workspaceMode: state.workspaceMode,
        nextDocumentNumber: state.nextDocumentNumber + 1,
        nextZIndex: state.nextZIndex + 1
      };
    }
    case "open-document": {
      const nextDocument = createLoadedDocument(
        action.document,
        state.workspaceSize,
        state.nextZIndex
      );

      return {
        ...state,
        documents: [...state.documents, nextDocument],
        activeDocumentId: nextDocument.id,
        nextZIndex: state.nextZIndex + 1
      };
    }
    case "activate-document":
      return focusDocument(state, action.id);
    case "update-document-frame":
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === action.id
            ? {
                ...document,
                frame: clampDocumentFrame(action.frame, state.workspaceSize)
              }
            : document
        )
      };
    case "toggle-document-maximize":
      if (!state.documents.some((document) => document.id === action.id)) {
        return state;
      }

      if (state.workspaceMode === "floating") {
        const focused = focusDocument(state, action.id);

        return {
          ...focused,
          workspaceMode: "tabbed-maximized",
          activeDocumentId: action.id
        };
      }

      if (state.activeDocumentId === action.id) {
        return {
          ...state,
          workspaceMode: "floating"
        };
      }

      return {
        ...state,
        activeDocumentId: action.id
      };
    case "select-tab":
      if (
        state.workspaceMode !== "tabbed-maximized" ||
        !state.documents.some((document) => document.id === action.id)
      ) {
        return state;
      }

      return {
        ...state,
        activeDocumentId: action.id
      };
    case "close-document": {
      const closeIndex = state.documents.findIndex((document) => document.id === action.id);

      if (closeIndex === -1) {
        return state;
      }

      const remainingDocuments = state.documents.filter((document) => document.id !== action.id);

      if (remainingDocuments.length === 0) {
        return {
          ...state,
          documents: [],
          activeDocumentId: null,
          workspaceMode: "floating"
        };
      }

      const fallbackIndex = Math.min(closeIndex, remainingDocuments.length - 1);
      const nextActiveDocument =
        state.activeDocumentId === action.id
          ? remainingDocuments[fallbackIndex]
          : remainingDocuments.find((document) => document.id === state.activeDocumentId) ??
            remainingDocuments[remainingDocuments.length - 1];

      return {
        ...state,
        documents: remainingDocuments,
        activeDocumentId: nextActiveDocument.id
      };
    }
    case "set-workspace-size":
      return {
        ...state,
        workspaceSize: action.size,
        documents: state.documents.map((document) => ({
          ...document,
          frame: clampDocumentFrame(document.frame, action.size)
        }))
      };
    case "mark-document-dirty":
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === action.id
            ? {
                ...document,
                dirty: action.dirty
              }
            : document
        )
      };
    case "sync-document-file":
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === action.id
            ? {
                ...document,
                title: action.title,
                filePath: action.filePath,
                dirty: action.dirty
              }
            : document
        )
      };
    default:
      return state;
  }
}

export function isToolOptionEnabled(tool: ToolId, option: keyof ToolOptions): boolean {
  if (tool !== "pencil") {
    return false;
  }

  return option === "size" || option === "opacity";
}

export function isStrokeTool(tool: ToolId): boolean {
  return tool === "pencil" || tool === "brush" || tool === "eraser";
}

export function formatDocumentLabel(
  document: Pick<DocumentWindowState, "title" | "width" | "height" | "dirty">
): string {
  const dirtyPrefix = document.dirty ? "* " : "";

  return `${dirtyPrefix}${document.title} - ${document.width}x${document.height}`;
}

function focusDocument(state: AppState, id: string): AppState {
  if (!state.documents.some((document) => document.id === id)) {
    return state;
  }

  if (state.workspaceMode === "tabbed-maximized") {
    return {
      ...state,
      activeDocumentId: id
    };
  }

  const nextZIndex = state.nextZIndex;

  return {
    ...state,
    documents: state.documents.map((document) =>
      document.id === id
        ? {
            ...document,
            zIndex: nextZIndex
          }
        : document
    ),
    activeDocumentId: id,
    nextZIndex: nextZIndex + 1
  };
}

function createDocument(
  documentNumber: number,
  workspaceSize: WorkspaceSize,
  zIndex: number,
  title: string
): DocumentWindowState {
  const offset = ((documentNumber - 1) % 6) * 28;
  const frame = clampDocumentFrame(
    {
      x: 40 + offset,
      y: 32 + offset,
      width: DEFAULT_FRAME_WIDTH,
      height: DEFAULT_FRAME_HEIGHT
    },
    workspaceSize
  );

  return {
    id: `document-${documentNumber}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    width: DEFAULT_IMAGE_WIDTH,
    height: DEFAULT_IMAGE_HEIGHT,
    background: "#ffffff",
    filePath: null,
    dirty: false,
    surfaceBootstrap: {
      kind: "blank"
    },
    frame,
    zIndex
  };
}

function createLoadedDocument(
  document: {
    id: string;
    title: string;
    width: number;
    height: number;
    filePath: string;
    initialDisplayTiles: DirtyDisplayTile[];
    initialPixelPayload: ArrayBuffer | null;
  },
  workspaceSize: WorkspaceSize,
  zIndex: number
): DocumentWindowState {
  const frame = clampDocumentFrame(
    {
      x: 56,
      y: 48,
      width: Math.min(DEFAULT_FRAME_WIDTH, document.width + 120),
      height: Math.min(DEFAULT_FRAME_HEIGHT, document.height + 120)
    },
    workspaceSize
  );

  return {
    id: document.id,
    title: document.title,
    width: document.width,
    height: document.height,
    background: "#00000000",
    filePath: document.filePath,
    dirty: false,
    surfaceBootstrap: {
      kind: "loaded",
      initialDisplayTiles: document.initialDisplayTiles,
      initialPixelPayload: document.initialPixelPayload
    },
    frame,
    zIndex
  };
}

function clampDocumentFrame(frame: Rect, workspaceSize: WorkspaceSize): Rect {
  if (workspaceSize.width <= 0 || workspaceSize.height <= 0) {
    return {
      x: frame.x,
      y: frame.y,
      width: Math.max(MIN_FRAME_WIDTH, frame.width),
      height: Math.max(MIN_FRAME_HEIGHT, frame.height)
    };
  }

  const maxWidth = Math.max(workspaceSize.width, MIN_FRAME_WIDTH);
  const maxHeight = Math.max(workspaceSize.height, MIN_FRAME_HEIGHT);
  const width = clamp(frame.width, MIN_FRAME_WIDTH, maxWidth);
  const height = clamp(frame.height, MIN_FRAME_HEIGHT, maxHeight);

  return {
    x: clamp(frame.x, 0, Math.max(0, workspaceSize.width - width)),
    y: clamp(frame.y, 0, Math.max(0, workspaceSize.height - height)),
    width,
    height
  };
}

function clampToolOption(option: keyof ToolOptions, value: number): number {
  const limits = TOOL_OPTION_LIMITS[option];

  return clamp(Math.round(value), limits.min, limits.max);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
