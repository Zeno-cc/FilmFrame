import type { AccessConfig } from "../src/config.js";

export function testConfig(overrides: Partial<AccessConfig> = {}): AccessConfig {
  return {
    nodeEnv: "test",
    bindHost: "127.0.0.1",
    port: 3000,
    databasePath: ":memory:",
    filmframeHost: "filmframe.example.test",
    adminHost: "filmframe-admin.example.test",
    internalHosts: new Set(["access", "localhost", "127.0.0.1"]),
    publicOrigin: "https://filmframe.example.test",
    adminOrigin: "https://filmframe-admin.example.test",
    accessIssuer: "https://team.cloudflareaccess.com",
    accessJwksUrl: new URL(
      "https://team.cloudflareaccess.com/cdn-cgi/access/certs",
    ),
    accessAudience: "test-access-audience",
    adminEmail: "admin@example.test",
    devAdminToken: null,
    secureCookies: true,
    sessionCookieName: "__Host-filmframe_session",
    ...overrides,
  };
}
