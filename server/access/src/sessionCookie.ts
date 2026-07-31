import type { CookieOptions, Request, Response } from "express";

import type { AccessConfig } from "./config.js";
import { SESSION_TTL_MS } from "./constants.js";

function cookieOptions(config: AccessConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "strict",
    path: "/",
  };
}

export function readSessionCookie(request: Request, config: AccessConfig): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const name = entry.slice(0, separator).trim();
    if (name !== config.sessionCookieName) continue;
    return entry.slice(separator + 1).trim();
  }
  return null;
}

export function setSessionCookie(
  response: Response,
  config: AccessConfig,
  token: string,
): void {
  response.cookie(config.sessionCookieName, token, {
    ...cookieOptions(config),
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(response: Response, config: AccessConfig): void {
  response.clearCookie(config.sessionCookieName, cookieOptions(config));
}
