use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{load_from_memory_with_format, save_buffer_with_format, ColorType, ImageFormat};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::Path;

const TILE_SIZE: usize = 128;

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout());
    let mut engine = EngineState::default();

    for line in stdin.lock().lines() {
        let response = match line {
            Ok(line) => handle_request_line(&mut engine, &line),
            Err(error) => ResponseEnvelope::error(0, format!("stdin read failed: {error}")),
        };

        if let Ok(serialized) = serde_json::to_string(&response) {
            let _ = writeln!(stdout, "{serialized}");
            let _ = stdout.flush();
        }
    }
}

fn handle_request_line(engine: &mut EngineState, line: &str) -> ResponseEnvelope {
    let envelope = match serde_json::from_str::<RequestEnvelope>(line) {
        Ok(envelope) => envelope,
        Err(error) => {
            return ResponseEnvelope::error(0, format!("invalid request: {error}"));
        }
    };

    match envelope.request {
        EngineRequest::CreateDocument(payload) => match engine.create_document(payload) {
            Ok(result) => ResponseEnvelope::ok(envelope.id, result),
            Err(error) => ResponseEnvelope::error(envelope.id, error),
        },
        EngineRequest::CloseDocument(payload) => match engine.close_document(payload) {
            Ok(result) => ResponseEnvelope::ok(envelope.id, result),
            Err(error) => ResponseEnvelope::error(envelope.id, error),
        },
        EngineRequest::LoadPng(payload) => match engine.load_png(payload) {
            Ok(result) => ResponseEnvelope::ok(envelope.id, result),
            Err(error) => ResponseEnvelope::error(envelope.id, error),
        },
        EngineRequest::SavePng(payload) => match engine.save_png(payload) {
            Ok(result) => ResponseEnvelope::ok(envelope.id, result),
            Err(error) => ResponseEnvelope::error(envelope.id, error),
        },
        EngineRequest::BeginStroke(payload) => match engine.begin_stroke(payload) {
            Ok(result) => ResponseEnvelope::ok(envelope.id, result),
            Err(error) => ResponseEnvelope::error(envelope.id, error),
        },
        EngineRequest::AppendStrokePoints(payload) => match engine.append_stroke_points(payload) {
            Ok(result) => ResponseEnvelope::ok(envelope.id, result),
            Err(error) => ResponseEnvelope::error(envelope.id, error),
        },
        EngineRequest::EndStroke(payload) => match engine.end_stroke(payload) {
            Ok(result) => ResponseEnvelope::ok(envelope.id, result),
            Err(error) => ResponseEnvelope::error(envelope.id, error),
        },
        EngineRequest::CancelStroke(payload) => match engine.cancel_stroke(payload) {
            Ok(result) => ResponseEnvelope::ok(envelope.id, result),
            Err(error) => ResponseEnvelope::error(envelope.id, error),
        },
    }
}

#[derive(Default)]
struct EngineState {
    documents: HashMap<String, DocumentState>,
}

impl EngineState {
    fn create_document(&mut self, payload: CreateDocumentRequest) -> Result<EngineMutationResult, String> {
        let background = parse_hex_color(&payload.background)?;
        let document = DocumentState::new(payload.width, payload.height, background);
        let updates = document.compose_display_tiles(document.all_tile_coords(), None);

        self.documents.insert(payload.document_id.clone(), document);

        Ok(EngineMutationResult {
            dirty_display_tiles: with_document_id(&payload.document_id, updates),
            document_dirty: false,
        })
    }

    fn close_document(&mut self, payload: CloseDocumentRequest) -> Result<EngineMutationResult, String> {
        self.documents.remove(&payload.document_id);

        Ok(EngineMutationResult {
            dirty_display_tiles: Vec::new(),
            document_dirty: false,
        })
    }

    fn load_png(&mut self, payload: LoadPngRequest) -> Result<LoadedDocumentResult, String> {
        let bytes = fs::read(&payload.path)
            .map_err(|error| format!("failed to read PNG \"{}\": {error}", payload.path))?;
        let image = load_from_memory_with_format(&bytes, ImageFormat::Png)
            .map_err(|error| format!("failed to decode PNG \"{}\": {error}", payload.path))?;
        let rgba = image.to_rgba8();
        let width = rgba.width() as usize;
        let height = rgba.height() as usize;

        if width == 0 || height == 0 {
            return Err("PNG must have non-zero dimensions".to_string());
        }

        let document = DocumentState::from_pixels(width, height, rgba.into_raw());
        let updates = document.compose_display_tiles(document.all_tile_coords(), None);

        self.documents.insert(payload.document_id.clone(), document);

        Ok(LoadedDocumentResult {
            document_id: payload.document_id.clone(),
            title: title_from_path(&payload.path),
            width,
            height,
            file_path: payload.path.clone(),
            dirty_display_tiles: with_document_id(&payload.document_id, updates),
            document_dirty: false,
        })
    }

    fn save_png(&mut self, payload: SavePngRequest) -> Result<SaveDocumentResult, String> {
        let document = self
            .documents
            .get_mut(&payload.document_id)
            .ok_or_else(|| "document not found".to_string())?;
        let composed = document.compose_full_display_pixels();

        save_buffer_with_format(
            &payload.path,
            &composed,
            document.width as u32,
            document.height as u32,
            ColorType::Rgba8,
            ImageFormat::Png,
        )
        .map_err(|error| format!("failed to save PNG \"{}\": {error}", payload.path))?;

        document.dirty = false;

        Ok(SaveDocumentResult {
            document_id: payload.document_id,
            title: title_from_path(&payload.path),
            file_path: payload.path,
            document_dirty: false,
        })
    }

    fn begin_stroke(&mut self, payload: BeginStrokeRequest) -> Result<EngineMutationResult, String> {
        let document = self
            .documents
            .get_mut(&payload.document_id)
            .ok_or_else(|| "document not found".to_string())?;

        let mut session = StrokeSession::new(
            payload.tool,
            payload.pointer_id,
            payload.brush,
            payload.point,
        );

        let touched_tiles = document.apply_points_to_session(&mut session, &[payload.point])?;
        let updates = document.compose_display_tiles(touched_tiles, Some(&session));
        document.stroke_session = Some(session);

        Ok(EngineMutationResult {
            dirty_display_tiles: with_document_id(&payload.document_id, updates),
            document_dirty: true,
        })
    }

    fn append_stroke_points(
        &mut self,
        payload: AppendStrokePointsRequest,
    ) -> Result<EngineMutationResult, String> {
        let document = self
            .documents
            .get_mut(&payload.document_id)
            .ok_or_else(|| "document not found".to_string())?;

        if payload.points.is_empty() {
            return Ok(EngineMutationResult {
                dirty_display_tiles: Vec::new(),
                document_dirty: document.dirty,
            });
        }

        let mut session = document
            .stroke_session
            .take()
            .ok_or_else(|| "no active stroke session".to_string())?;

        if session.pointer_id != payload.pointer_id {
            document.stroke_session = Some(session);
            return Err("pointer id does not match active stroke".to_string());
        }

        let touched_tiles = document.apply_points_to_session(&mut session, &payload.points)?;
        let updates = document.compose_display_tiles(touched_tiles, Some(&session));
        document.stroke_session = Some(session);

        Ok(EngineMutationResult {
            dirty_display_tiles: with_document_id(&payload.document_id, updates),
            document_dirty: true,
        })
    }

    fn end_stroke(&mut self, payload: EndStrokeRequest) -> Result<EngineMutationResult, String> {
        let document = self
            .documents
            .get_mut(&payload.document_id)
            .ok_or_else(|| "document not found".to_string())?;

        let session = document
            .stroke_session
            .take()
            .ok_or_else(|| "no active stroke session".to_string())?;

        if session.pointer_id != payload.pointer_id {
            document.stroke_session = Some(session);
            return Err("pointer id does not match active stroke".to_string());
        }

        let touched_tiles = session.touched_tiles.clone();

        for tile in &touched_tiles {
            let tile_pixels = document.compose_active_layer_tile(tile, Some(&session));
            document.write_active_layer_tile(tile, &tile_pixels);
        }

        document.dirty = document.dirty || !touched_tiles.is_empty();
        let updates = document.compose_display_tiles(touched_tiles, None);

        Ok(EngineMutationResult {
            dirty_display_tiles: with_document_id(&payload.document_id, updates),
            document_dirty: document.dirty,
        })
    }

    fn cancel_stroke(&mut self, payload: CancelStrokeRequest) -> Result<EngineMutationResult, String> {
        let document = self
            .documents
            .get_mut(&payload.document_id)
            .ok_or_else(|| "document not found".to_string())?;

        let session = document
            .stroke_session
            .take()
            .ok_or_else(|| "no active stroke session".to_string())?;

        if session.pointer_id != payload.pointer_id {
            document.stroke_session = Some(session);
            return Err("pointer id does not match active stroke".to_string());
        }

        let updates = document.compose_display_tiles(session.touched_tiles, None);

        Ok(EngineMutationResult {
            dirty_display_tiles: with_document_id(&payload.document_id, updates),
            document_dirty: document.dirty,
        })
    }
}

struct DocumentState {
    width: usize,
    height: usize,
    layers: Vec<Layer>,
    active_layer_index: usize,
    stroke_session: Option<StrokeSession>,
    dirty: bool,
}

impl DocumentState {
    fn new(width: usize, height: usize, background: [u8; 4]) -> Self {
        let mut base_pixels = vec![0; width * height * 4];

        for pixel in base_pixels.chunks_exact_mut(4) {
            pixel.copy_from_slice(&background);
        }

        Self::from_pixels(width, height, base_pixels)
    }

    fn from_pixels(width: usize, height: usize, pixels: Vec<u8>) -> Self {
        Self {
            width,
            height,
            layers: vec![Layer::new(pixels, BlendMode::Normal, 1.0)],
            active_layer_index: 0,
            stroke_session: None,
            dirty: false,
        }
    }

    fn apply_points_to_session(
        &self,
        session: &mut StrokeSession,
        points: &[StrokePoint],
    ) -> Result<HashSet<TileCoord>, String> {
        let mut dirty_tiles = HashSet::new();
        let mut previous = session.last_point;

        for point in points {
            rasterize_line(previous, *point, |x, y| {
                self.stamp_point(session, x, y, &mut dirty_tiles);
            });
            previous = *point;
        }

        session.last_point = previous;

        Ok(dirty_tiles)
    }

    fn stamp_point(
        &self,
        session: &mut StrokeSession,
        center_x: i32,
        center_y: i32,
        dirty_tiles: &mut HashSet<TileCoord>,
    ) {
        let stamp_size = session.brush.size.max(1) as i32;
        let offset = stamp_size / 2;
        let active_layer = &self.layers[self.active_layer_index];

        for pixel_y in center_y - offset..center_y - offset + stamp_size {
            for pixel_x in center_x - offset..center_x - offset + stamp_size {
                if pixel_x < 0
                    || pixel_y < 0
                    || pixel_x >= self.width as i32
                    || pixel_y >= self.height as i32
                {
                    continue;
                }

                let tile = TileCoord::from_pixel(pixel_x as usize, pixel_y as usize);
                dirty_tiles.insert(tile);
                session.touched_tiles.insert(tile);

                session
                    .stroke_snapshot_tiles
                    .entry(tile)
                    .or_insert_with(|| extract_tile(&active_layer.pixels, self.width, self.height, tile));

                let (tile_width, tile_height) = tile_dimensions(self.width, self.height, tile);
                let scratch_tile = session
                    .stroke_scratch_tiles
                    .entry(tile)
                    .or_insert_with(|| vec![0; tile_width * tile_height * 4]);
                let local_x = pixel_x as usize - tile.x * TILE_SIZE;
                let local_y = pixel_y as usize - tile.y * TILE_SIZE;
                let index = ((local_y * tile_width) + local_x) * 4;
                let color = session.brush.color;

                scratch_tile[index] = color[0];
                scratch_tile[index + 1] = color[1];
                scratch_tile[index + 2] = color[2];
                scratch_tile[index + 3] = 255;
            }
        }
    }

    fn compose_display_tiles(
        &self,
        tiles: HashSet<TileCoord>,
        preview_session: Option<&StrokeSession>,
    ) -> Vec<DisplayTileUpdate> {
        let mut updates = Vec::new();

        for tile in tiles {
            let (tile_width, tile_height) = tile_dimensions(self.width, self.height, tile);
            let mut composed = vec![0; tile_width * tile_height * 4];

            for (layer_index, layer) in self.layers.iter().enumerate() {
                if !layer.visible {
                    continue;
                }

                let pixels = if layer_index == self.active_layer_index {
                    self.compose_active_layer_tile(&tile, preview_session)
                } else {
                    extract_tile(&layer.pixels, self.width, self.height, tile)
                };

                composite_layer_tile(&mut composed, &pixels, layer.opacity, layer.blend_mode);
            }

            updates.push(DisplayTileUpdate {
                document_id: String::new(),
                tile_x: tile.x,
                tile_y: tile.y,
                x: tile.x * TILE_SIZE,
                y: tile.y * TILE_SIZE,
                width: tile_width,
                height: tile_height,
                pixels_base64: STANDARD.encode(composed),
            });
        }

        updates
    }

    fn compose_active_layer_tile(
        &self,
        tile: &TileCoord,
        preview_session: Option<&StrokeSession>,
    ) -> Vec<u8> {
        let committed = extract_tile(
            &self.layers[self.active_layer_index].pixels,
            self.width,
            self.height,
            *tile,
        );

        let Some(session) = preview_session else {
            return committed;
        };

        let Some(snapshot) = session.stroke_snapshot_tiles.get(tile) else {
            return committed;
        };

        let Some(scratch) = session.stroke_scratch_tiles.get(tile) else {
            return committed;
        };

        let mut working = snapshot.clone();
        apply_tool_to_tile(&mut working, scratch, session.tool);
        mix_tiles(snapshot, &working, session.brush.opacity)
    }

    fn compose_full_display_pixels(&self) -> Vec<u8> {
        let mut composed = vec![0; self.width * self.height * 4];

        for layer in &self.layers {
            if !layer.visible {
                continue;
            }

            composite_layer_tile(&mut composed, &layer.pixels, layer.opacity, layer.blend_mode);
        }

        composed
    }

    fn write_active_layer_tile(&mut self, tile: &TileCoord, tile_pixels: &[u8]) {
        write_tile(
            &mut self.layers[self.active_layer_index].pixels,
            self.width,
            self.height,
            *tile,
            tile_pixels,
        );
    }

    fn all_tile_coords(&self) -> HashSet<TileCoord> {
        let mut tiles = HashSet::new();
        let x_tiles = self.width.div_ceil(TILE_SIZE);
        let y_tiles = self.height.div_ceil(TILE_SIZE);

        for y in 0..y_tiles {
            for x in 0..x_tiles {
                tiles.insert(TileCoord { x, y });
            }
        }

        tiles
    }
}

struct Layer {
    pixels: Vec<u8>,
    blend_mode: BlendMode,
    opacity: f32,
    visible: bool,
}

impl Layer {
    fn new(pixels: Vec<u8>, blend_mode: BlendMode, opacity: f32) -> Self {
        Self {
            pixels,
            blend_mode,
            opacity,
            visible: true,
        }
    }
}

struct StrokeSession {
    tool: StrokeTool,
    pointer_id: u32,
    brush: StrokeBrushParams,
    last_point: StrokePoint,
    stroke_snapshot_tiles: HashMap<TileCoord, Vec<u8>>,
    stroke_scratch_tiles: HashMap<TileCoord, Vec<u8>>,
    touched_tiles: HashSet<TileCoord>,
}

impl StrokeSession {
    fn new(tool: StrokeTool, pointer_id: u32, brush: StrokeBrushParams, point: StrokePoint) -> Self {
        Self {
            tool,
            pointer_id,
            brush,
            last_point: point,
            stroke_snapshot_tiles: HashMap::new(),
            stroke_scratch_tiles: HashMap::new(),
            touched_tiles: HashSet::new(),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct TileCoord {
    x: usize,
    y: usize,
}

impl TileCoord {
    fn from_pixel(x: usize, y: usize) -> Self {
        Self {
            x: x / TILE_SIZE,
            y: y / TILE_SIZE,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StrokePoint {
    x: i32,
    y: i32,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum StrokeTool {
    Pencil,
    Brush,
    Eraser,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StrokeBrushParams {
    size: u32,
    opacity: u8,
    #[serde(rename = "flow")]
    _flow: u8,
    #[serde(rename = "dabSpacing")]
    _dab_spacing: u8,
    color: [u8; 4],
}

#[derive(Clone, Copy, Debug)]
#[allow(dead_code)]
enum BlendMode {
    Normal,
    Multiply,
}

#[derive(Deserialize)]
struct RequestEnvelope {
    id: u64,
    #[serde(flatten)]
    request: EngineRequest,
}

#[derive(Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
enum EngineRequest {
    CreateDocument(CreateDocumentRequest),
    CloseDocument(CloseDocumentRequest),
    LoadPng(LoadPngRequest),
    SavePng(SavePngRequest),
    BeginStroke(BeginStrokeRequest),
    AppendStrokePoints(AppendStrokePointsRequest),
    EndStroke(EndStrokeRequest),
    CancelStroke(CancelStrokeRequest),
}

#[derive(Serialize)]
struct ResponseEnvelope {
    id: u64,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl ResponseEnvelope {
    fn ok<T: Serialize>(id: u64, result: T) -> Self {
        Self {
            id,
            ok: true,
            result: Some(serde_json::to_value(result).expect("response result must serialize")),
            error: None,
        }
    }

    fn error(id: u64, error: String) -> Self {
        Self {
            id,
            ok: false,
            result: None,
            error: Some(error),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateDocumentRequest {
    document_id: String,
    width: usize,
    height: usize,
    background: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloseDocumentRequest {
    document_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoadPngRequest {
    document_id: String,
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavePngRequest {
    document_id: String,
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BeginStrokeRequest {
    document_id: String,
    tool: StrokeTool,
    pointer_id: u32,
    brush: StrokeBrushParams,
    point: StrokePoint,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppendStrokePointsRequest {
    document_id: String,
    pointer_id: u32,
    points: Vec<StrokePoint>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EndStrokeRequest {
    document_id: String,
    pointer_id: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CancelStrokeRequest {
    document_id: String,
    pointer_id: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineMutationResult {
    dirty_display_tiles: Vec<DisplayTileUpdate>,
    document_dirty: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadedDocumentResult {
    document_id: String,
    title: String,
    width: usize,
    height: usize,
    file_path: String,
    dirty_display_tiles: Vec<DisplayTileUpdate>,
    document_dirty: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveDocumentResult {
    document_id: String,
    title: String,
    file_path: String,
    document_dirty: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DisplayTileUpdate {
    document_id: String,
    tile_x: usize,
    tile_y: usize,
    x: usize,
    y: usize,
    width: usize,
    height: usize,
    pixels_base64: String,
}

fn with_document_id(document_id: &str, mut updates: Vec<DisplayTileUpdate>) -> Vec<DisplayTileUpdate> {
    for update in &mut updates {
        update.document_id = document_id.to_string();
    }

    updates
}

fn title_from_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "Untitled.png".to_string())
}

fn tile_dimensions(width: usize, height: usize, tile: TileCoord) -> (usize, usize) {
    let tile_x = tile.x * TILE_SIZE;
    let tile_y = tile.y * TILE_SIZE;

    ((width - tile_x).min(TILE_SIZE), (height - tile_y).min(TILE_SIZE))
}

fn extract_tile(pixels: &[u8], width: usize, height: usize, tile: TileCoord) -> Vec<u8> {
    let (tile_width, tile_height) = tile_dimensions(width, height, tile);
    let mut tile_pixels = vec![0; tile_width * tile_height * 4];

    for row in 0..tile_height {
        let src_y = tile.y * TILE_SIZE + row;
        let src_start = ((src_y * width) + tile.x * TILE_SIZE) * 4;
        let src_end = src_start + (tile_width * 4);
        let dst_start = row * tile_width * 4;
        let dst_end = dst_start + (tile_width * 4);
        tile_pixels[dst_start..dst_end].copy_from_slice(&pixels[src_start..src_end]);
    }

    tile_pixels
}

fn write_tile(pixels: &mut [u8], width: usize, height: usize, tile: TileCoord, tile_pixels: &[u8]) {
    let (tile_width, tile_height) = tile_dimensions(width, height, tile);

    for row in 0..tile_height {
        let dst_y = tile.y * TILE_SIZE + row;
        let dst_start = ((dst_y * width) + tile.x * TILE_SIZE) * 4;
        let dst_end = dst_start + (tile_width * 4);
        let src_start = row * tile_width * 4;
        let src_end = src_start + (tile_width * 4);
        pixels[dst_start..dst_end].copy_from_slice(&tile_pixels[src_start..src_end]);
    }
}

fn apply_tool_to_tile(target: &mut [u8], scratch: &[u8], tool: StrokeTool) {
    for index in (0..target.len()).step_by(4) {
        let src_alpha = scratch[index + 3] as f32 / 255.0;

        if src_alpha <= 0.0 {
            continue;
        }

        match tool {
            StrokeTool::Pencil | StrokeTool::Brush => {
                let inv_alpha = 1.0 - src_alpha;

                for channel in 0..3 {
                    let src = scratch[index + channel] as f32 / 255.0;
                    let dst = target[index + channel] as f32 / 255.0;
                    let blended = src + (dst * inv_alpha);
                    target[index + channel] = (blended * 255.0).round().clamp(0.0, 255.0) as u8;
                }

                let dst_alpha = target[index + 3] as f32 / 255.0;
                let blended_alpha = src_alpha + (dst_alpha * inv_alpha);
                target[index + 3] = (blended_alpha * 255.0).round().clamp(0.0, 255.0) as u8;
            }
            StrokeTool::Eraser => {
                for channel in 0..4 {
                    target[index + channel] = 0;
                }
            }
        }
    }
}

fn mix_tiles(snapshot: &[u8], working: &[u8], opacity: u8) -> Vec<u8> {
    let alpha = (opacity as f32 / 100.0).clamp(0.0, 1.0);
    let mut mixed = vec![0; snapshot.len()];

    for index in 0..snapshot.len() {
        let snapshot_value = snapshot[index] as f32;
        let working_value = working[index] as f32;
        mixed[index] = (snapshot_value + ((working_value - snapshot_value) * alpha))
            .round()
            .clamp(0.0, 255.0) as u8;
    }

    mixed
}

fn composite_layer_tile(target: &mut [u8], source: &[u8], layer_opacity: f32, blend_mode: BlendMode) {
    for index in (0..target.len()).step_by(4) {
        let src_alpha = (source[index + 3] as f32 / 255.0) * layer_opacity;
        let dst_alpha = target[index + 3] as f32 / 255.0;

        if src_alpha <= 0.0 {
            continue;
        }

        let out_alpha = src_alpha + (dst_alpha * (1.0 - src_alpha));

        for channel in 0..3 {
            let src = source[index + channel] as f32 / 255.0;
            let dst = target[index + channel] as f32 / 255.0;
            let blended_rgb = blend_channel(src, dst, blend_mode);
            let premultiplied = (blended_rgb * src_alpha) + (dst * dst_alpha * (1.0 - src_alpha));
            let out = if out_alpha > 0.0 {
                premultiplied / out_alpha
            } else {
                0.0
            };

            target[index + channel] = (out * 255.0).round().clamp(0.0, 255.0) as u8;
        }

        target[index + 3] = (out_alpha * 255.0).round().clamp(0.0, 255.0) as u8;
    }
}

fn blend_channel(source: f32, destination: f32, blend_mode: BlendMode) -> f32 {
    match blend_mode {
        BlendMode::Normal => source,
        BlendMode::Multiply => source * destination,
    }
}

fn rasterize_line<F>(start: StrokePoint, end: StrokePoint, mut stamp: F)
where
    F: FnMut(i32, i32),
{
    let mut x = start.x;
    let mut y = start.y;
    let dx = (end.x - start.x).abs();
    let dy = (end.y - start.y).abs();
    let sx = if start.x < end.x { 1 } else { -1 };
    let sy = if start.y < end.y { 1 } else { -1 };
    let mut err = dx - dy;

    loop {
        stamp(x, y);

        if x == end.x && y == end.y {
            break;
        }

        let err2 = err * 2;

        if err2 > -dy {
            err -= dy;
            x += sx;
        }

        if err2 < dx {
            err += dx;
            y += sy;
        }
    }
}

fn parse_hex_color(value: &str) -> Result<[u8; 4], String> {
    let hex = value.trim().trim_start_matches('#');

    if hex.len() != 6 && hex.len() != 8 {
        return Err("background color must be #RRGGBB or #RRGGBBAA".to_string());
    }

    let red = u8::from_str_radix(&hex[0..2], 16).map_err(|error| error.to_string())?;
    let green = u8::from_str_radix(&hex[2..4], 16).map_err(|error| error.to_string())?;
    let blue = u8::from_str_radix(&hex[4..6], 16).map_err(|error| error.to_string())?;
    let alpha = if hex.len() == 8 {
        u8::from_str_radix(&hex[6..8], 16).map_err(|error| error.to_string())?
    } else {
        255
    };

    Ok([red, green, blue, alpha])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn brush(opacity: u8) -> StrokeBrushParams {
        StrokeBrushParams {
            size: 1,
            opacity,
            _flow: 100,
            _dab_spacing: 12,
            color: [0, 0, 0, 255],
        }
    }

    fn point(x: i32, y: i32) -> StrokePoint {
        StrokePoint { x, y }
    }

    fn unique_temp_png_path(stem: &str) -> String {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be monotonic")
            .as_nanos();

        std::env::temp_dir()
            .join(format!("electron-tools-{stem}-{suffix}.png"))
            .to_string_lossy()
            .into_owned()
    }

    #[test]
    fn opacity_does_not_accumulate_inside_one_stroke() {
        let mut engine = EngineState::default();

        engine
            .create_document(CreateDocumentRequest {
                document_id: "doc".into(),
                width: 8,
                height: 8,
                background: "#ffffff".into(),
            })
            .unwrap();

        engine
            .begin_stroke(BeginStrokeRequest {
                document_id: "doc".into(),
                tool: StrokeTool::Pencil,
                pointer_id: 1,
                brush: brush(50),
                point: point(2, 2),
            })
            .unwrap();

        engine
            .append_stroke_points(AppendStrokePointsRequest {
                document_id: "doc".into(),
                pointer_id: 1,
                points: vec![point(2, 2), point(2, 2), point(2, 2)],
            })
            .unwrap();

        engine
            .end_stroke(EndStrokeRequest {
                document_id: "doc".into(),
                pointer_id: 1,
            })
            .unwrap();

        let document = engine.documents.get("doc").unwrap();
        let index = ((2 * document.width) + 2) * 4;

        assert_eq!(document.layers[0].pixels[index], 128);
        assert_eq!(document.layers[0].pixels[index + 1], 128);
        assert_eq!(document.layers[0].pixels[index + 2], 128);
    }

    #[test]
    fn touched_tiles_snapshot_is_copy_on_write() {
        let document = DocumentState::new(256, 256, [255, 255, 255, 255]);
        let mut session = StrokeSession::new(StrokeTool::Pencil, 1, brush(40), point(4, 4));

        let touched = document.apply_points_to_session(&mut session, &[point(4, 4)]).unwrap();

        assert_eq!(touched.len(), 1);
        assert_eq!(session.stroke_snapshot_tiles.len(), 1);
        assert_eq!(session.stroke_scratch_tiles.len(), 1);
        assert_eq!(session.touched_tiles.len(), 1);
    }

    #[test]
    fn cancel_stroke_keeps_committed_layer_unchanged() {
        let mut engine = EngineState::default();

        engine
            .create_document(CreateDocumentRequest {
                document_id: "doc".into(),
                width: 8,
                height: 8,
                background: "#ffffff".into(),
            })
            .unwrap();

        engine
            .begin_stroke(BeginStrokeRequest {
                document_id: "doc".into(),
                tool: StrokeTool::Pencil,
                pointer_id: 1,
                brush: brush(25),
                point: point(1, 1),
            })
            .unwrap();

        engine
            .cancel_stroke(CancelStrokeRequest {
                document_id: "doc".into(),
                pointer_id: 1,
            })
            .unwrap();

        let document = engine.documents.get("doc").unwrap();
        let index = ((1 * document.width) + 1) * 4;

        assert_eq!(&document.layers[0].pixels[index..index + 4], &[255, 255, 255, 255]);
    }

    #[test]
    fn upper_layer_blend_mode_affects_final_display_tile() {
        let mut document = DocumentState::new(8, 8, [255, 255, 255, 255]);
        let mut multiply_pixels = vec![0; 8 * 8 * 4];

        for pixel in multiply_pixels.chunks_exact_mut(4) {
            pixel.copy_from_slice(&[255, 0, 0, 255]);
        }

        document.layers.push(Layer::new(multiply_pixels, BlendMode::Multiply, 1.0));

        let mut session = StrokeSession::new(StrokeTool::Pencil, 1, brush(100), point(1, 1));
        let touched = document.apply_points_to_session(&mut session, &[point(1, 1)]).unwrap();
        let updates = document.compose_display_tiles(touched, Some(&session));
        let bytes = STANDARD.decode(&updates[0].pixels_base64).unwrap();
        let index = ((1 * updates[0].width) + 1) * 4;

        assert_eq!(&bytes[index..index + 4], &[0, 0, 0, 255]);
    }

    #[test]
    fn save_and_load_png_round_trip_preserves_pixels() {
        let mut engine = EngineState::default();
        let save_path = unique_temp_png_path("round-trip");

        engine
            .create_document(CreateDocumentRequest {
                document_id: "doc".into(),
                width: 8,
                height: 8,
                background: "#ffffff".into(),
            })
            .unwrap();

        engine
            .begin_stroke(BeginStrokeRequest {
                document_id: "doc".into(),
                tool: StrokeTool::Pencil,
                pointer_id: 1,
                brush: brush(100),
                point: point(3, 3),
            })
            .unwrap();

        engine
            .end_stroke(EndStrokeRequest {
                document_id: "doc".into(),
                pointer_id: 1,
            })
            .unwrap();

        engine
            .save_png(SavePngRequest {
                document_id: "doc".into(),
                path: save_path.clone(),
            })
            .unwrap();

        let loaded = engine
            .load_png(LoadPngRequest {
                document_id: "loaded".into(),
                path: save_path.clone(),
            })
            .unwrap();
        let document = engine.documents.get("loaded").unwrap();
        let index = ((3 * document.width) + 3) * 4;

        assert_eq!(loaded.width, 8);
        assert_eq!(loaded.height, 8);
        assert_eq!(&document.layers[0].pixels[index..index + 4], &[0, 0, 0, 255]);

        let _ = fs::remove_file(save_path);
    }
}
