import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

import type { AccessJwtVerifier } from "../accessJwt.js";
import type { AccessConfig } from "../config.js";
import { isTrustedProxyAddress } from "../network.js";

function tokensMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function requireAdminAccess(
  config: AccessConfig,
  verifier: AccessJwtVerifier,
): RequestHandler {
  return async (request, response, next) => {
    const devToken = request.header("X-FilmFrame-Dev-Admin");
    if (
      config.nodeEnv === "development" &&
      config.devAdminToken &&
      devToken &&
      isTrustedProxyAddress(request.socket.remoteAddress) &&
      tokensMatch(devToken, config.devAdminToken)
    ) {
      response.locals.adminIdentity = {
        subject: "local-development",
        email: config.adminEmail,
      };
      next();
      return;
    }

    const assertion = request.header("Cf-Access-Jwt-Assertion");
    if (!assertion) {
      response.status(401).type("text/plain").send("Unauthorized");
      return;
    }

    try {
      response.locals.adminIdentity = await verifier(assertion);
      next();
    } catch {
      response.status(401).type("text/plain").send("Unauthorized");
    }
  };
}
