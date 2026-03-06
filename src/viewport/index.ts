import type { DirtyDisplayTile } from "../../shared/engine-protocol";

export interface ViewportBackend {
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void;
  replaceDocumentSurface(width: number, height: number): void;
  uploadTiles(updates: DirtyDisplayTile[], pixelPayload: ArrayBuffer | null): void;
  dispose(): void;
}
