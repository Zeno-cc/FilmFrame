import { createServer } from "node:http";

import { createAccessJwtVerifier } from "./accessJwt.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";

const config = loadConfig();
const database = openDatabase(config.databasePath);
const accessJwtVerifier = createAccessJwtVerifier({
  issuer: config.accessIssuer,
  audience: config.accessAudience,
  adminEmail: config.adminEmail,
  jwksUrl: config.accessJwksUrl,
});
const app = createApp({ config, database, accessJwtVerifier });
const server = createServer(app);

server.listen(config.port, config.bindHost, () => {
  console.info(JSON.stringify({ event: "access_service_started", port: config.port }));
});

function shutdown(signal: string): void {
  console.info(JSON.stringify({ event: "access_service_stopping", signal }));
  server.close(() => {
    database.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
