import type { DirtyDisplayTile } from "../../shared/engine-protocol";
import type { ViewportBackend } from "./index";

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision mediump float;

uniform sampler2D u_texture;
in vec2 v_texCoord;
out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_texCoord);
}
`;

export class WebGL2ViewportBackend implements ViewportBackend {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly texture: WebGLTexture;
  private readonly positionLocation: number;
  private readonly texCoordLocation: number;
  private readonly textureLocation: WebGLUniformLocation;
  private documentWidth = 0;
  private documentHeight = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      stencil: false
    });

    if (!gl) {
      throw new Error("WebGL2 is unavailable in this renderer.");
    }

    const program = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
    const vao = gl.createVertexArray();
    const vertexBuffer = gl.createBuffer();
    const texture = gl.createTexture();
    const textureLocation = gl.getUniformLocation(program, "u_texture");
    const positionLocation = gl.getAttribLocation(program, "a_position");
    const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");

    if (!vao || !vertexBuffer || !texture || !textureLocation) {
      throw new Error("Failed to initialize WebGL viewport resources.");
    }

    this.gl = gl;
    this.program = program;
    this.vao = vao;
    this.vertexBuffer = vertexBuffer;
    this.texture = texture;
    this.textureLocation = textureLocation;
    this.positionLocation = positionLocation;
    this.texCoordLocation = texCoordLocation;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, 16 * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(
      positionLocation,
      2,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0
    );
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(
      texCoordLocation,
      2,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      2 * Float32Array.BYTES_PER_ELEMENT
    );
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    gl.useProgram(program);
    gl.uniform1i(textureLocation, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.clearColor(0, 0, 0, 0);
  }

  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const width = Math.max(1, Math.floor(cssWidth * devicePixelRatio));
    const height = Math.max(1, Math.floor(cssHeight * devicePixelRatio));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.gl.viewport(0, 0, width, height);
    this.render();
  }

  replaceDocumentSurface(width: number, height: number): void {
    const maxTextureSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;

    if (width > maxTextureSize || height > maxTextureSize) {
      throw new Error(
        `Document surface ${width}x${height} exceeds the WebGL2 texture limit (${maxTextureSize}).`
      );
    }

    this.documentWidth = width;
    this.documentHeight = height;

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      width,
      height,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      null
    );
    this.render();
  }

  uploadTiles(updates: DirtyDisplayTile[], pixelPayload: ArrayBuffer | null): void {
    if (updates.length === 0) {
      return;
    }

    if (!pixelPayload) {
      throw new Error("Dirty tile updates arrived without a pixel payload.");
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);

    for (const update of updates) {
      const view = new Uint8Array(pixelPayload, update.byteOffset, update.byteLength);

      this.gl.texSubImage2D(
        this.gl.TEXTURE_2D,
        0,
        update.x,
        update.y,
        update.width,
        update.height,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        view
      );
    }

    this.render();
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.vertexBuffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }

  private render(): void {
    const gl = this.gl;

    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.documentWidth <= 0 || this.documentHeight <= 0) {
      return;
    }

    const viewportWidth = this.canvas.width;
    const viewportHeight = this.canvas.height;

    if (viewportWidth <= 0 || viewportHeight <= 0) {
      return;
    }

    const scale = Math.min(viewportWidth / this.documentWidth, viewportHeight / this.documentHeight);
    const drawWidth = this.documentWidth * scale;
    const drawHeight = this.documentHeight * scale;
    const left = (viewportWidth - drawWidth) / 2;
    const top = (viewportHeight - drawHeight) / 2;
    const right = left + drawWidth;
    const bottom = top + drawHeight;

    const x1 = (left / viewportWidth) * 2 - 1;
    const x2 = (right / viewportWidth) * 2 - 1;
    const y1 = 1 - (top / viewportHeight) * 2;
    const y2 = 1 - (bottom / viewportHeight) * 2;

    const vertices = new Float32Array([
      x1,
      y1,
      0,
      0,
      x2,
      y1,
      1,
      0,
      x1,
      y2,
      0,
      1,
      x2,
      y2,
      1,
      1
    ]);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("Failed to create a WebGL program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return program;
  }

  const detail = gl.getProgramInfoLog(program) ?? "Unknown WebGL link error";
  gl.deleteProgram(program);
  throw new Error(detail);
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Failed to allocate a WebGL shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return shader;
  }

  const detail = gl.getShaderInfoLog(shader) ?? "Unknown WebGL compile error";
  gl.deleteShader(shader);
  throw new Error(detail);
}
