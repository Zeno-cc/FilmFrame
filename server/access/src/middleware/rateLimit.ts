import type { Request, RequestHandler } from "express";

interface WindowState {
  count: number;
  resetsAt: number;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
  maxEntries?: number;
  cost?: (request: Request) => number;
}

export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const states = new Map<string, WindowState>();
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? 10_000;

  return (request, response, next) => {
    const key = request.ip || request.socket.remoteAddress || "unknown";
    const currentTime = now();
    const existing = states.get(key);
    const state =
      existing && currentTime < existing.resetsAt
        ? existing
        : { count: 0, resetsAt: currentTime + options.windowMs };
    if (!existing && states.size >= maxEntries) {
      const oldestKey = states.keys().next().value as string | undefined;
      if (oldestKey) states.delete(oldestKey);
    }
    const candidateCost = options.cost?.(request) ?? 1;
    const cost =
      Number.isSafeInteger(candidateCost) && candidateCost >= 0
        ? candidateCost
        : 1;
    if (cost === 0) {
      next();
      return;
    }
    state.count += cost;
    states.set(key, state);

    if (state.count > options.limit) {
      response.setHeader("Retry-After", Math.ceil((state.resetsAt - currentTime) / 1_000));
      response.status(429).type("text/plain").send("请求过于频繁，请稍后重试。");
      return;
    }
    next();
  };
}
