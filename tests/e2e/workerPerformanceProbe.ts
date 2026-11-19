import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import type { Page } from '@playwright/test';

export type WorkerPerformanceEvidence = {
  requestedIds: number[];
  requestBackends: string[];
  successfulIds: number[];
  failedIds: number[];
  responseBackends: string[];
  fallbacks: number;
  webgl2Contexts: number;
  floatColorBuffers: number;
  floatReadbacks: number;
  glErrors: string[];
};

export async function instrumentWorkerPerformance(page: Page): Promise<WorkerPerformanceEvidence> {
  const backendChunk = (await readdir('dist/assets')).find(name => /^backend-[^/]+\.js$/.test(name));
  if (!backendChunk) throw new Error('Build the production backend chunk before measuring Worker performance');
  const evidence: WorkerPerformanceEvidence = {
    requestedIds: [], requestBackends: [], successfulIds: [], failedIds: [], responseBackends: [],
    fallbacks: 0, webgl2Contexts: 0, floatColorBuffers: 0, floatReadbacks: 0, glErrors: [],
  };
  page.on('console', message => {
    const text = message.text();
    if (text === '__stripWebgl2') evidence.webgl2Contexts += 1;
    if (text === '__stripFloatColorBuffer') evidence.floatColorBuffers += 1;
    if (text === '__stripFloatReadback') evidence.floatReadbacks += 1;
    if (text.startsWith('__stripFloatReadbackError:')) evidence.glErrors.push(text);
    if (text.startsWith('__stripWorkerRequest:')) {
      const [, id, backend] = text.split(':');
      evidence.requestedIds.push(Number(id));
      evidence.requestBackends.push(backend);
    }
    if (text.startsWith('__stripWorkerSuccess:')) {
      const [, id, backend] = text.split(':');
      evidence.successfulIds.push(Number(id));
      evidence.responseBackends.push(backend);
    }
    if (text.startsWith('__stripWorkerFailure:')) {
      evidence.failedIds.push(Number(text.slice('__stripWorkerFailure:'.length)));
      evidence.responseBackends.push('error');
    }
    if (message.type() === 'warning' && text.includes('falling back to main thread')) evidence.fallbacks += 1;
  });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class StripWorkerProbe extends NativeWorker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        this.addEventListener('error', event => console.error('__stripWorkerError:' + event.message));
      }
      postMessage(message: { type?: string; id?: number; settings?: { spectralBackend?: string } }, options?: StructuredSerializeOptions | Transferable[]) {
        if (message.type === 'generateFilmStrip' && typeof message.id === 'number') {
          console.info(`__stripWorkerRequest:${message.id}:${message.settings?.spectralBackend ?? 'auto'}`);
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await page.route(new RegExp(`/assets/${backendChunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\?.*)?$`), async route => {
    const response = await route.fetch();
    const source = await response.text();
    const factory = /function [A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*=\{\}\)\{const [A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*\.pipeline;if\(![A-Za-z_$][\w$]*\)throw new Error\("A validated spectral resource pipeline is required"\);/;
    const factoryMatch = factory.exec(source);
    if (!factoryMatch) throw new Error('Unable to identify the production spectral backend factory');
    const factoryStart = factoryMatch.index;
    const factoryEnd = source.indexOf('export{', factoryStart);
    if (factoryEnd < 0) throw new Error('Unable to bound the production spectral backend factory');
    let observations = 0;
    const instrumentedFactory = source.slice(factoryStart, factoryEnd)
      .replace(/return new ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*(?:,[A-Za-z_$][\w$]*)?)\)/g, (_statement, constructor: string, args: string) => {
        observations += 1;
        return `return globalThis.__stripObserveBackend(new ${constructor}(${args}))`;
      });
    if (observations !== 2) throw new Error(`Expected two spectral backend return sites, found ${observations}`);
    const instrumented = `globalThis.__stripObserveBackend = backend => { globalThis.__stripLastBackend = backend.kind; console.info('__stripObservedBackend:' + backend.kind); return backend; };\n${source.slice(0, factoryStart)}${instrumentedFactory}${source.slice(factoryEnd)}`;
    execFileSync(process.execPath, ['--input-type=module', '--check'], { input: instrumented });
    await route.fulfill({ response, body: instrumented });
  });
  await page.route(/\/(?:services\/filmWorker\.ts|assets\/filmWorker-[^/]+\.js)(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    const originalSource = await response.text();
    // Concatenate the original module: interpolating it would evaluate its
    // production template literals in the test process and break the Worker.
    const source = `
      const __stripBackendByRequest = new Map();
      globalThis.addEventListener('message', event => {
        const request = event.data;
        if (request?.type === 'generateFilmStrip' && request.settings?.edgeRenderMode === 'physical135') {
          __stripBackendByRequest.set(request.id, globalThis.__stripLastBackend ?? 'unobserved');
        }
      });
      const __stripGetContext = OffscreenCanvas.prototype.getContext;
      OffscreenCanvas.prototype.getContext = function(type, ...args) {
        const context = __stripGetContext.call(this, type, ...args);
        if (type === 'webgl2' && context instanceof WebGL2RenderingContext) {
          console.info('__stripWebgl2');
          if (context.getExtension('EXT_color_buffer_float')) console.info('__stripFloatColorBuffer');
          if (!context.__stripInstrumented) {
            let floatReadbackPending = false;
            const readPixels = context.readPixels.bind(context);
            context.readPixels = (...readArgs) => {
              readPixels(...readArgs);
              if (readArgs[4] === context.RGBA && readArgs[5] === context.FLOAT) floatReadbackPending = true;
            };
            const getError = context.getError.bind(context);
            context.getError = () => {
              const error = getError();
              if (floatReadbackPending) {
                console.info(error === context.NO_ERROR ? '__stripFloatReadback' : '__stripFloatReadbackError:' + error);
                floatReadbackPending = false;
              }
              return error;
            };
            context.__stripInstrumented = true;
          }
        }
        return context;
      };
      const __stripPostMessage = globalThis.postMessage;
      globalThis.postMessage = function(message, ...args) {
        if (__stripBackendByRequest.has(message.id)) {
          console.info((message.ok === true ? '__stripWorkerSuccess:' : '__stripWorkerFailure:') + message.id + (message.ok === true ? ':' + (globalThis.__stripLastBackend ?? 'unobserved') : ''));
          __stripBackendByRequest.delete(message.id);
        }
        return __stripPostMessage.call(this, message, ...args);
      };
    ` + originalSource;
    execFileSync(process.execPath, ['--input-type=module', '--check'], { input: source });
    await route.fulfill({ response, body: source });
  });
  return evidence;
}
