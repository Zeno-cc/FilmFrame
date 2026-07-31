import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

export interface VerifiedAdminIdentity {
  subject: string;
  email: string;
}

export type AccessJwtVerifier = (token: string) => Promise<VerifiedAdminIdentity>;

export interface AccessJwtOptions {
  issuer: string;
  audience: string;
  adminEmail: string;
  jwksUrl: URL;
  keyResolver?: JWTVerifyGetKey;
}

function readIdentity(payload: JWTPayload): VerifiedAdminIdentity | null {
  if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
  if (typeof payload.email !== "string" || payload.email.length === 0) return null;
  return { subject: payload.sub, email: payload.email.toLowerCase() };
}

export function createAccessJwtVerifier(options: AccessJwtOptions): AccessJwtVerifier {
  const keyResolver = options.keyResolver ?? createRemoteJWKSet(options.jwksUrl);
  const expectedEmail = options.adminEmail.toLowerCase();

  return async (token: string) => {
    const { payload } = await jwtVerify(token, keyResolver, {
      algorithms: ["RS256"],
      issuer: options.issuer,
      audience: options.audience,
      requiredClaims: ["exp", "nbf"],
    });

    const identity = readIdentity(payload);
    if (!identity || identity.email !== expectedEmail) {
      throw new Error("Access identity is not authorized");
    }
    return identity;
  };
}
