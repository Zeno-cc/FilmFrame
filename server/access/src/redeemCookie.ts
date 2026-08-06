import { randomBytes } from "node:crypto";

import type { CookieOptions, Request, Response } from "express";

import type { AccessConfig } from "./config.js";
import {
  ACCESS_FORM_NONCE_TTL_MS,
  DEVELOPMENT_REDEEM_COOKIE,
  PRODUCTION_REDEEM_COOKIE,
} from "./constants.js";

function cookieName(config: AccessConfig): string {
  return config.secureCookies ? PRODUCTION_REDEEM_COOKIE : DEVELOPMENT_REDEEM_COOKIE;
}

function cookieOptions(config: AccessConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "strict",
    path: "/",
  };
}

export function createRedeemBinding(): string {
  return randomBytes(32).toString("base64url");
}

export function readRedeemCookie(request: Request, config: AccessConfig): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  const expectedName = cookieName(config);
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const name = entry.slice(0, separator).trim();
    if (name !== expectedName) continue;
    return entry.slice(separator + 1).trim();
  }
  return null;
}

export function setRedeemCookie(
  response: Response,
  config: AccessConfig,
  binding: string,
): void {
  response.cookie(cookieName(config), binding, {
    ...cookieOptions(config),
    maxAge: ACCESS_FORM_NONCE_TTL_MS,
  });
}

export function clearRedeemCookie(response: Response, config: AccessConfig): void {
  response.clearCookie(cookieName(config), cookieOptions(config));
}
