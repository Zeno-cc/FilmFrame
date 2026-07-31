import type { RequestHandler } from "express";

import type { AccessConfig } from "../config.js";
import { isTrustedProxyAddress, requestHostname } from "../network.js";

export function requireKnownHost(config: AccessConfig): RequestHandler {
  const allowed = new Set([
    config.filmframeHost,
    config.adminHost,
    ...config.internalHosts,
  ]);
  return (request, response, next) => {
    const hostname = requestHostname(request);
    if (!hostname || !allowed.has(hostname)) {
      response.status(421).type("text/plain").send("Misdirected Request");
      return;
    }
    next();
  };
}

export function requireHost(expectedHost: string): RequestHandler {
  return (request, response, next) => {
    if (requestHostname(request) !== expectedHost) {
      response.status(404).type("text/plain").send("Not Found");
      return;
    }
    next();
  };
}

export function requireInternalRequest(config: AccessConfig): RequestHandler {
  return (request, response, next) => {
    const hostname = requestHostname(request);
    if (
      !hostname ||
      !config.internalHosts.has(hostname) ||
      !isTrustedProxyAddress(request.socket.remoteAddress)
    ) {
      response.status(404).type("text/plain").send("Not Found");
      return;
    }
    next();
  };
}

export function requireWriteCsrf(origin: string): RequestHandler {
  return (request, response, next) => {
    if (
      request.header("Origin") !== origin ||
      request.header("X-FilmFrame-CSRF") !== "1"
    ) {
      response.status(403).type("text/plain").send("Forbidden");
      return;
    }
    next();
  };
}

export const requireJsonContentType: RequestHandler = (request, response, next) => {
  if (!request.is("application/json")) {
    response.status(415).type("text/plain").send("Unsupported Media Type");
    return;
  }
  next();
};
