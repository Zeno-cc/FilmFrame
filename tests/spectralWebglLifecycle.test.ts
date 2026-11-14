import { describe, expect, it, vi } from 'vitest';
import { WebGlDevice } from '../services/spectral/webgl/device';
import { WebGlSpectralRenderer } from '../services/spectral/webgl/renderer';
import { PortraGpuResources } from '../services/spectral/webgl/resources';
import { createCineStillPipeline } from '../services/spectral/cineStill';
import { createPortraPipeline } from '../services/spectral/portraPipeline';
import { portraResource } from '../services/spectral/resources/portraResource';
import vision500t from '../services/spectral/resources/kodak_vision3_500t-setup.json';

// Simulate GL ownership and framebuffer bindings, not shader numerical output.
function fakeCanvas() {
  const textures = new Set<object>();
  const framebuffers = new Set<object>();
  const payloads = new Map<object, Float32Array>();
  const attachments = new Map<object, object>();
  const bindings = new Map<number, object | null>();
  const events = new Map<string, EventListener>();
  let activeUnit = 0;
  let boundFramebuffer: object | null = null;
  let failTextureAt = Infinity;
  let allocations = 0;
  let lost = false;
  const clips: number[] = [];
  const constants = [
    'RGBA', 'FLOAT', 'UNSIGNED_BYTE', 'RGBA32F', 'RGBA16F', 'TEXTURE_2D',
    'FRAMEBUFFER', 'FRAMEBUFFER_COMPLETE', 'COLOR_ATTACHMENT0',
    'MAX_VIEWPORT_DIMS', 'MAX_TEXTURE_SIZE', 'MAX_RENDERBUFFER_SIZE',
    'MAX_COMBINED_TEXTURE_IMAGE_UNITS', 'MAX_TEXTURE_IMAGE_UNITS',
    'IMPLEMENTATION_COLOR_READ_FORMAT', 'IMPLEMENTATION_COLOR_READ_TYPE',
    'TEXTURE_BINDING_2D', 'VERTEX_SHADER', 'FRAGMENT_SHADER', 'HIGH_FLOAT',
    'COMPILE_STATUS', 'LINK_STATUS',
  ];
  const gl: Record<string, unknown> = Object.fromEntries(constants.map((name, index) => [name, index + 1]));
  Object.assign(gl, {
    TEXTURE0: 1000, NO_ERROR: 0,
    getExtension: (name: string) => name === 'EXT_color_buffer_float' ? {}
      : name === 'WEBGL_lose_context' ? { loseContext: () => { lost = true; } } : null,
    isContextLost: () => lost,
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
    getParameter: (key: number) => {
      if (key === gl.MAX_VIEWPORT_DIMS) return [16384, 16384];
      if (key === gl.MAX_TEXTURE_IMAGE_UNITS || key === gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) return 16;
      if (key === gl.IMPLEMENTATION_COLOR_READ_FORMAT) return gl.RGBA;
      // A default framebuffer may expose only byte readback.
      if (key === gl.IMPLEMENTATION_COLOR_READ_TYPE) return boundFramebuffer ? gl.FLOAT : gl.UNSIGNED_BYTE;
      if (key === gl.TEXTURE_BINDING_2D) return bindings.get(activeUnit) ?? null;
      return 16384;
    },
    createTexture: () => {
      if (++allocations === failTextureAt) return null;
      const texture = {};
      textures.add(texture);
      return texture;
    },
    deleteTexture: (texture: object) => { textures.delete(texture); payloads.delete(texture); },
    activeTexture: (unit: number) => { activeUnit = unit - 1000; },
    bindTexture: (_target: number, texture: object | null) => { bindings.set(activeUnit, texture); },
    texImage2D: (...args: unknown[]) => {
      const texture = bindings.get(activeUnit);
      if (texture) payloads.set(texture, args[8] instanceof Float32Array ? args[8].slice() : new Float32Array(4));
    },
    createFramebuffer: () => { const framebuffer = {}; framebuffers.add(framebuffer); return framebuffer; },
    deleteFramebuffer: (framebuffer: object) => { framebuffers.delete(framebuffer); attachments.delete(framebuffer); },
    bindFramebuffer: (_target: number, framebuffer: object | null) => { boundFramebuffer = framebuffer; },
    framebufferTexture2D: (_target: number, _attachment: number, _textarget: number, texture: object) => {
      if (boundFramebuffer) attachments.set(boundFramebuffer, texture);
    },
    checkFramebufferStatus: () => gl.FRAMEBUFFER_COMPLETE,
    getFramebufferAttachmentParameter: () => boundFramebuffer ? attachments.get(boundFramebuffer) : null,
    readPixels: (_x: number, _y: number, _w: number, _h: number, _format: number, _type: number, output: Float32Array) => {
      const texture = boundFramebuffer && attachments.get(boundFramebuffer);
      if (texture) output.set((payloads.get(texture) ?? new Float32Array(4)).subarray(0, output.length));
    },
    drawArrays: () => {
      const source = bindings.get(0);
      const target = boundFramebuffer && attachments.get(boundFramebuffer);
      if (source && target) payloads.set(target, payloads.get(source)?.slice() ?? new Float32Array(4));
    },
    getError: () => 0,
    createShader: () => ({}), getShaderParameter: () => true,
    createProgram: () => ({}), getProgramParameter: () => true,
    createBuffer: () => ({}), createVertexArray: () => ({}),
    getUniformLocation: (_program: object, name: string) => ({ name }),
    uniform1f: (location: { name: string }, value: number) => { if (location.name === 'uClip') clips.push(value); },
  });
  const context = new Proxy(gl, { get: (target, name: string) => name in target ? target[name] : () => {} });
  const canvas = {
    getContext: () => context,
    addEventListener: (name: string, callback: EventListener) => { events.set(name, callback); },
    removeEventListener: (name: string) => { events.delete(name); },
  } as unknown as OffscreenCanvas;
  return { canvas, textures, framebuffers, clips, events,
    failNextTexture: () => { failTextureAt = allocations + 1; },
    failTextureIn: (count: number) => { failTextureAt = allocations + count; },
    get lost() { return lost; },
  };
}

describe('spectral GPU resource lifecycle', () => {
  it('binds the requested float framebuffer before querying its readback type', () => {
    const fake = fakeCanvas();
    const device = new WebGlDevice(fake.canvas);
    const texture = device.createTexture(1, 1, device.gl.RGBA32F, 16, new Float32Array([1, 2, 3, 1]), 'test');
    const framebuffer = device.createFramebuffer(texture);
    device.gl.bindFramebuffer(device.gl.FRAMEBUFFER, null);
    expect(Array.from(device.readPixels(framebuffer, 1, 1))).toEqual([1, 2, 3, 1]);
    device.dispose();
    expect(fake.textures.size).toBe(0);
    expect(fake.framebuffers.size).toBe(0);
  });

  it('releases context and listeners if a constructor capability probe cannot allocate', () => {
    const fake = fakeCanvas();
    fake.failNextTexture();
    expect(() => new WebGlDevice(fake.canvas)).toThrow('capability probe');
    expect(fake.events.size).toBe(0);
    expect(fake.framebuffers.size).toBe(0);
    expect(fake.lost).toBe(true);
  });

  it('reports actual frame texture bytes and releases them after success and allocation failure', () => {
    const fake = fakeCanvas();
    const renderer = new WebGlSpectralRenderer(fake.canvas, createPortraPipeline(portraResource));
    const setupBytes = renderer.info.textureBytes;
    const image = { width: 2, height: 1, pixels: new Float32Array(6).fill(0.2) };
    const { frame } = renderer.createFrame(image);
    expect(renderer.info.frameTextureBytes).toBe(renderer.info.textureBytes - setupBytes);
    renderer.releaseFrame(frame);
    expect(renderer.info.textureBytes).toBe(setupBytes);
    const create = vi.spyOn(renderer.device, 'createTexture');
    create.mockImplementationOnce((...args) => {
      create.mockRestore();
      const texture = renderer.device.createTexture(...args);
      fake.failNextTexture();
      return texture;
    });
    expect(() => renderer.createFrame(image)).toThrow('texture');
    expect(renderer.info.textureBytes).toBe(setupBytes);
    renderer.dispose();
    expect(renderer.info.textureBytes).toBe(0);
    expect(fake.textures.size).toBe(0);
  });

  it('releases earlier setup textures if a later resource allocation fails', () => {
    const fake = fakeCanvas();
    const device = new WebGlDevice(fake.canvas);
    fake.failTextureIn(2);
    expect(() => new PortraGpuResources(device, createPortraPipeline(portraResource))).toThrow('texture');
    expect(device.textureBytes).toBe(0);
    expect(fake.textures.size).toBe(0);
    device.dispose();
  });

  it('releases the frame and partial spatial allocation when CineStill scratch runs out', () => {
    const fake = fakeCanvas();
    const renderer = new WebGlSpectralRenderer(fake.canvas, createCineStillPipeline(vision500t));
    const setupBytes = renderer.info.textureBytes;
    // Source + five stages + first reduction succeed; headroom allocation fails.
    fake.failTextureIn(8);
    expect(() => renderer.render({ width: 1, height: 1, pixels: new Float32Array([8, 4, 2]) })).toThrow('texture');
    expect(renderer.info.textureBytes).toBe(setupBytes);
    expect(renderer.measurements.activeFrames).toBe(0);
    renderer.dispose();
    expect(fake.textures.size).toBe(0);
    expect(fake.framebuffers.size).toBe(0);
  });

  it('reduces the real source for a single CineStill pixel and releases redeveloped scratch', () => {
    const fake = fakeCanvas();
    const renderer = new WebGlSpectralRenderer(fake.canvas, createCineStillPipeline(vision500t));
    const setupBytes = renderer.info.textureBytes;
    const { frame } = renderer.render({ width: 1, height: 1, pixels: new Float32Array([8, 4, 2]) });
    expect(fake.clips).toEqual([8]);
    expect(renderer.info.frameTextureBytes).toBe(renderer.info.textureBytes - setupBytes);
    const bytes = renderer.info.textureBytes;
    renderer.developFilm(frame);
    expect(renderer.info.textureBytes).toBe(bytes);
    renderer.releaseFrame(frame);
    expect(renderer.info.textureBytes).toBe(setupBytes);
    renderer.dispose();
    expect(fake.textures.size).toBe(0);
    expect(fake.framebuffers.size).toBe(0);
  });
});
