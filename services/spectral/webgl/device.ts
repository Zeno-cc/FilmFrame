export type WebGlCanvas = HTMLCanvasElement | OffscreenCanvas;
export type WebGlStage = 'filmRaw' | 'negativeDensity' | 'paperLogExposure' | 'paperDensity' | 'printRgb';

export interface WebGlFormatInfo {
  internalFormat: 'RGBA32F' | 'RGBA16F';
  readType: 'FLOAT' | 'HALF_FLOAT';
  bytesPerPixel: number;
  renderable: boolean;
  readback: boolean;
}

export interface WebGlCapabilities {
  webgl2: true;
  colorBufferFloat: true;
  vendor: string;
  renderer: string;
  unmaskedVendor?: string;
  unmaskedRenderer?: string;
  version: string;
  shadingLanguageVersion: string;
  maxTextureSize: number;
  maxRenderbufferSize: number;
  maxTextureImageUnits: number;
  maxFragmentTextureUnits: number;
  maxViewportDimensions: readonly [number, number];
  fragmentHighp: {
    supported: boolean;
    rangeMin: number;
    rangeMax: number;
    precision: number;
  };
  floatRenderTargets: readonly WebGlFormatInfo[];
  warnings: readonly string[];
}

export interface WebGlContextOptions {
  maxTextureBytes?: number;
  onContextLost?: (message: string) => void;
}

export class WebGlSpectralError extends Error {
  constructor(message: string, readonly code: 'unsupported' | 'context-lost' | 'disposed' | 'invalid-input' | 'allocation' | 'shader' | 'readback') {
    super(message);
    this.name = 'WebGlSpectralError';
  }
}

function assertAlive(state: { disposed: boolean; lost: boolean }): void {
  if (state.disposed) throw new WebGlSpectralError('WebGL spectral renderer has been disposed', 'disposed');
  if (state.lost) throw new WebGlSpectralError('WebGL context was lost; create a new renderer before retrying', 'context-lost');
}

function checkError(gl: WebGL2RenderingContext, label: string, code: 'allocation' | 'readback' = 'allocation'): void {
  const error = gl.getError();
  if (error !== gl.NO_ERROR) throw new WebGlSpectralError(`${label} failed with WebGL error 0x${error.toString(16)}`, code);
}

/** Owns all GL objects created through it. Loss and disposal are terminal, never a silent legacy fallback. */
export class WebGlDevice {
  readonly gl: WebGL2RenderingContext;
  readonly capabilities: WebGlCapabilities;
  private readonly ownedTextures = new Set<WebGLTexture>();
  private readonly ownedFramebuffers = new Set<WebGLFramebuffer>();
  private readonly ownedPrograms = new Set<WebGLProgram>();
  private readonly ownedBuffers = new Set<WebGLBuffer>();
  private readonly ownedVertexArrays = new Set<WebGLVertexArrayObject>();
  private readonly state = { disposed: false, lost: false };
  private readonly removeLossListeners: () => void;
  private allocatedTextureBytes = 0;

  constructor(readonly canvas: WebGlCanvas, private readonly options: WebGlContextOptions = {}) {
    const context = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!context) throw new WebGlSpectralError('WebGL2 is unavailable; use the equivalent CPU spectral backend', 'unsupported');
    this.gl = context;
    if (!context.getExtension('EXT_color_buffer_float')) {
      this.removeLossListeners = () => {};
      context.getExtension('WEBGL_lose_context')?.loseContext();
      throw new WebGlSpectralError('EXT_color_buffer_float is required for floating-point negative and paper density', 'unsupported');
    }
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    const precision = context.getShaderPrecisionFormat(context.FRAGMENT_SHADER, context.HIGH_FLOAT);
    const viewport = context.getParameter(context.MAX_VIEWPORT_DIMS) as Int32Array;
    this.capabilities = {
      webgl2: true, colorBufferFloat: true,
      vendor: String(context.getParameter(context.VENDOR)),
      renderer: String(context.getParameter(context.RENDERER)),
      ...(debug ? {
        unmaskedVendor: String(context.getParameter(debug.UNMASKED_VENDOR_WEBGL)),
        unmaskedRenderer: String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)),
      } : {}),
      version: String(context.getParameter(context.VERSION)),
      shadingLanguageVersion: String(context.getParameter(context.SHADING_LANGUAGE_VERSION)),
      maxTextureSize: context.getParameter(context.MAX_TEXTURE_SIZE),
      maxRenderbufferSize: context.getParameter(context.MAX_RENDERBUFFER_SIZE),
      maxTextureImageUnits: context.getParameter(context.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
      maxFragmentTextureUnits: context.getParameter(context.MAX_TEXTURE_IMAGE_UNITS),
      maxViewportDimensions: [viewport[0], viewport[1]],
      fragmentHighp: {
        supported: precision !== null && precision.precision > 0,
        rangeMin: precision?.rangeMin ?? 0, rangeMax: precision?.rangeMax ?? 0,
        precision: precision?.precision ?? 0,
      },
      floatRenderTargets: [],
      warnings: [],
    };
    if (!this.capabilities.fragmentHighp.supported) {
      this.removeLossListeners = () => {};
      context.getExtension('WEBGL_lose_context')?.loseContext();
      throw new WebGlSpectralError('Fragment highp is required for spectral log exposure and density', 'unsupported');
    }
    const lost = (event: Event) => {
      event.preventDefault();
      this.state.lost = true;
      this.allocatedTextureBytes = 0;
      this.options.onContextLost?.('WebGL context lost; no spectral result was substituted');
    };
    const restored = () => {
      // Programs, textures and GL state are not restored implicitly. Fail this instance honestly.
      this.state.lost = true;
      this.options.onContextLost?.('WebGL context restored; disposed renderer must be recreated with its resources');
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    this.removeLossListeners = () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    };
    const floatRenderTargets: WebGlFormatInfo[] = [];
    const warnings: string[] = [];
    try {
      for (const [internalFormat, readType, bytesPerPixel] of [['RGBA32F', 'FLOAT', 16], ['RGBA16F', 'HALF_FLOAT', 8]] as const) {
        const result = this.probeFormat(internalFormat === 'RGBA32F' ? context.RGBA32F : context.RGBA16F, internalFormat, readType, bytesPerPixel);
        if (!result.readback) warnings.push(`${internalFormat} full-float readback is unavailable; readback is rejected rather than quantized`);
        if (!result.renderable) {
          throw new WebGlSpectralError(`${internalFormat} is not a complete floating-point render target`, 'unsupported');
        }
        floatRenderTargets.push(result);
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
    this.capabilities.floatRenderTargets = floatRenderTargets;
    this.capabilities.warnings = warnings;
  }

  assertAlive(): void { assertAlive(this.state); }
  get disposed(): boolean { return this.state.disposed; }
  get lost(): boolean { return this.state.lost || this.gl.isContextLost(); }
  get textureBytes(): number { return this.state.lost ? 0 : this.allocatedTextureBytes; }

  private probeFormat(internalFormat: number, name: WebGlFormatInfo['internalFormat'], readType: WebGlFormatInfo['readType'], bytesPerPixel: number): WebGlFormatInfo {
    const gl = this.gl;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
      if (texture) gl.deleteTexture(texture);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      throw new WebGlSpectralError(`Unable to allocate ${name} capability probe`, 'allocation');
    }
    let renderable = false;
    let readback = false;
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      renderable = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE && gl.getError() === gl.NO_ERROR;
      if (renderable) {
        const pixel = new Float32Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pixel);
        readback = gl.getError() === gl.NO_ERROR;
      }
    } catch {
      renderable = false;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
    }
    return { internalFormat: name, readType, bytesPerPixel, renderable, readback };
  }

  createTexture(width: number, height: number, internalFormat: number, bytesPerPixel: number, pixels: ArrayBufferView | null, label: string, linear = false): WebGLTexture {
    this.assertAlive();
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
      || width > this.capabilities.maxTextureSize || height > this.capabilities.maxTextureSize
      || width > Math.floor(Number.MAX_SAFE_INTEGER / height)) {
      throw new WebGlSpectralError(`${label} texture dimensions exceed the validated device limits`, 'invalid-input');
    }
    const bytes = width * height * bytesPerPixel;
    if (!Number.isSafeInteger(bytes) || (this.options.maxTextureBytes !== undefined && this.allocatedTextureBytes + bytes > this.options.maxTextureBytes)) {
      throw new WebGlSpectralError(`${label} texture exceeds the GPU texture byte budget`, 'allocation');
    }
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new WebGlSpectralError(`Unable to create ${label} texture`, 'allocation');
    this.ownedTextures.add(texture);
    this.allocatedTextureBytes += bytes;
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, gl.FLOAT, pixels);
      checkError(gl, `${label} texture upload`);
      return texture;
    } catch (error) {
      this.deleteTexture(texture, bytes);
      throw error;
    }
  }

  deleteFramebuffer(framebuffer: WebGLFramebuffer): void {
    if (this.ownedFramebuffers.delete(framebuffer) && !this.state.lost) this.gl.deleteFramebuffer(framebuffer);
  }

  deleteVertexArray(vertexArray: WebGLVertexArrayObject): void {
    if (this.ownedVertexArrays.delete(vertexArray) && !this.state.lost) this.gl.deleteVertexArray(vertexArray);
  }

  createVertexArray(): WebGLVertexArrayObject {
    this.assertAlive();
    const vertexArray = this.gl.createVertexArray();
    if (!vertexArray) throw new WebGlSpectralError('Unable to allocate spectral VAO', 'allocation');
    this.ownedVertexArrays.add(vertexArray);
    return vertexArray;
  }

  deleteTexture(texture: WebGLTexture, bytes: number): void {
    if (this.ownedTextures.delete(texture)) {
      this.allocatedTextureBytes = Math.max(0, this.allocatedTextureBytes - bytes);
      if (!this.state.lost) this.gl.deleteTexture(texture);
    }
  }

  createFramebuffer(texture: WebGLTexture): WebGLFramebuffer {
    this.assertAlive();
    const gl = this.gl;
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new WebGlSpectralError('Unable to create spectral framebuffer', 'allocation');
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(framebuffer);
      throw new WebGlSpectralError('Floating-point spectral framebuffer is incomplete', 'unsupported');
    }
    this.ownedFramebuffers.add(framebuffer);
    return framebuffer;
  }

  createProgram(fragmentSource: string, vertexSource: string): WebGLProgram {
    this.assertAlive();
    const gl = this.gl;
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type);
      if (!shader) throw new WebGlSpectralError('Unable to create WebGL shader', 'shader');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) ?? 'unknown compiler error';
        gl.deleteShader(shader);
        throw new WebGlSpectralError(`Spectral shader compilation failed: ${log}`, 'shader');
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    let fragment: WebGLShader | undefined;
    try {
      fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
      const program = gl.createProgram();
      if (!program) throw new WebGlSpectralError('Unable to create spectral shader program', 'shader');
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) ?? 'unknown linker error';
        gl.deleteProgram(program);
        throw new WebGlSpectralError(`Spectral shader link failed: ${log}`, 'shader');
      }
      this.ownedPrograms.add(program);
      return program;
    } finally {
      gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
    }
  }

  createBuffer(data: Float32Array): WebGLBuffer {
    this.assertAlive();
    const gl = this.gl;
    const buffer = gl.createBuffer();
    if (!buffer) throw new WebGlSpectralError('Unable to create fullscreen vertex buffer', 'allocation');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.ownedBuffers.add(buffer);
    return buffer;
  }

  readPixels(framebuffer: WebGLFramebuffer, width: number, height: number): Float32Array {
    this.assertAlive();
    if (width * height > this.capabilities.maxTextureSize ** 2) throw new WebGlSpectralError('Invalid readback dimensions', 'invalid-input');
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new WebGlSpectralError('Readback framebuffer is incomplete', 'readback');
    const readFormat = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
    const readType = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
    if (readFormat !== gl.RGBA || readType !== gl.FLOAT) throw new WebGlSpectralError(`FLOAT readback is unsupported for this float target (format 0x${readFormat.toString(16)}, type 0x${readType.toString(16)})`, 'readback');
    const output = new Float32Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, output);
    checkError(gl, 'Floating-point stage readback', 'readback');
    for (let index = 0; index < output.length; index += 1) {
      if (!Number.isFinite(output[index])) throw new WebGlSpectralError(`Non-finite GPU stage value at ${index}`, 'readback');
    }
    return output;
  }

  dispose(): void {
    if (this.state.disposed) return;
    this.state.disposed = true;
    this.removeLossListeners();
    if (!this.gl.isContextLost()) {
      for (const framebuffer of this.ownedFramebuffers) this.gl.deleteFramebuffer(framebuffer);
      for (const texture of this.ownedTextures) this.gl.deleteTexture(texture);
      for (const program of this.ownedPrograms) this.gl.deleteProgram(program);
      for (const buffer of this.ownedBuffers) this.gl.deleteBuffer(buffer);
      for (const vertexArray of this.ownedVertexArrays) this.gl.deleteVertexArray(vertexArray);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }
    this.ownedFramebuffers.clear();
    this.ownedTextures.clear();
    this.ownedPrograms.clear();
    this.ownedBuffers.clear();
    this.ownedVertexArrays.clear();
    this.allocatedTextureBytes = 0;
    // This context has one owner; explicit loss releases the backing context as well.
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
