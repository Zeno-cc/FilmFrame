import { resolve } from "node:path";
import { z } from "zod";

import {
  DEVELOPMENT_SESSION_COOKIE,
  PRODUCTION_SESSION_COOKIE,
} from "./constants.js";

const hostnameSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .transform((value) => value.toLowerCase().replace(/\.$/, ""))
  .refine(
    (value) =>
      value === "localhost" ||
      value === "127.0.0.1" ||
      /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
        value,
      ),
    "must be a hostname without a scheme or path",
  );

const booleanSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return value;
}, z.boolean());

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  DATABASE_PATH: z.string().trim().min(1).default("./data/access.sqlite"),
  FILMFRAME_HOST: hostnameSchema,
  ADMIN_HOST: hostnameSchema,
  INTERNAL_HOSTS: z.string().trim().default("access,localhost,127.0.0.1"),
  CF_ACCESS_TEAM_DOMAIN: hostnameSchema,
  CF_ACCESS_AUDIENCE: z.string().trim().min(8).max(512),
  CF_ACCESS_ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
  DEV_ADMIN_TOKEN: z.string().min(32).max(512).optional(),
  SECURE_COOKIES: booleanSchema.default(true),
  FILMFRAME_UPDATER_ENABLED: booleanSchema.default(false),
  FILMFRAME_UPDATER_SOCKET: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .default("/run/filmframe-updater/updater.sock"),
  FILMFRAME_UPDATER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(10_000)
    .default(3_000),
});

export interface AccessConfig {
  nodeEnv: "development" | "test" | "production";
  bindHost: string;
  port: number;
  databasePath: string;
  filmframeHost: string;
  adminHost: string;
  internalHosts: ReadonlySet<string>;
  publicOrigin: string;
  adminOrigin: string;
  accessIssuer: string;
  accessJwksUrl: URL;
  accessAudience: string;
  adminEmail: string;
  devAdminToken: string | null;
  secureCookies: boolean;
  sessionCookieName: string;
  updaterEnabled: boolean;
  updaterSocketPath: string;
  updaterTimeoutMs: number;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AccessConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid access-service configuration: ${fields}`);
  }

  const value = parsed.data;
  if (value.NODE_ENV === "production" && !value.SECURE_COOKIES) {
    throw new Error("SECURE_COOKIES cannot be disabled in production");
  }
  if (value.NODE_ENV === "production" && value.DEV_ADMIN_TOKEN) {
    throw new Error("DEV_ADMIN_TOKEN cannot be enabled in production");
  }
  if (value.FILMFRAME_HOST === value.ADMIN_HOST) {
    throw new Error("FILMFRAME_HOST and ADMIN_HOST must be different");
  }
  if (!value.FILMFRAME_UPDATER_SOCKET.startsWith("/")) {
    throw new Error("FILMFRAME_UPDATER_SOCKET must be an absolute path");
  }
  if (
    value.NODE_ENV === "production" &&
    value.FILMFRAME_UPDATER_ENABLED &&
    value.FILMFRAME_UPDATER_SOCKET !== "/run/filmframe-updater/updater.sock"
  ) {
    throw new Error("FILMFRAME_UPDATER_SOCKET must use the production socket path");
  }

  const internalHosts = new Set(
    value.INTERNAL_HOSTS.split(",")
      .map((host) => host.trim().toLowerCase().replace(/\.$/, ""))
      .filter(Boolean),
  );

  const accessIssuer = `https://${value.CF_ACCESS_TEAM_DOMAIN}`;
  return {
    nodeEnv: value.NODE_ENV,
    bindHost: value.HOST,
    port: value.PORT,
    databasePath: resolve(value.DATABASE_PATH),
    filmframeHost: value.FILMFRAME_HOST,
    adminHost: value.ADMIN_HOST,
    internalHosts,
    publicOrigin: `https://${value.FILMFRAME_HOST}`,
    adminOrigin: `https://${value.ADMIN_HOST}`,
    accessIssuer,
    accessJwksUrl: new URL("/cdn-cgi/access/certs", accessIssuer),
    accessAudience: value.CF_ACCESS_AUDIENCE,
    adminEmail: value.CF_ACCESS_ADMIN_EMAIL,
    devAdminToken: value.DEV_ADMIN_TOKEN ?? null,
    secureCookies: value.SECURE_COOKIES,
    sessionCookieName: value.SECURE_COOKIES
      ? PRODUCTION_SESSION_COOKIE
      : DEVELOPMENT_SESSION_COOKIE,
    updaterEnabled: value.FILMFRAME_UPDATER_ENABLED,
    updaterSocketPath: value.FILMFRAME_UPDATER_SOCKET,
    updaterTimeoutMs: value.FILMFRAME_UPDATER_TIMEOUT_MS,
  };
}
