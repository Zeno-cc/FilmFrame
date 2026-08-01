import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express from "express";
import request from "supertest";

import { createRateLimiter } from "../src/middleware/rateLimit.js";

describe("weighted rate limiter", () => {
  it("charges configured request costs while preserving unit defaults", async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/weighted",
      createRateLimiter({
        limit: 5,
        windowMs: 60_000,
        now: () => 1_000,
        cost: (incoming) => Number(incoming.body?.count),
      }),
      (_incoming, response) => response.status(204).end(),
    );
    assert.equal((await request(app).post("/weighted").send({ count: 3 })).status, 204);
    assert.equal((await request(app).post("/weighted").send({ count: 2 })).status, 204);
    const limited = await request(app).post("/weighted").send({ count: 1 });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers["retry-after"], "60");
  });

  it("allows zero-cost idempotent replays after a rejected request exceeds the budget", async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/weighted",
      createRateLimiter({
        limit: 5,
        windowMs: 60_000,
        now: () => 1_000,
        cost: (incoming) => Number(incoming.body?.count),
      }),
      (_incoming, response) => response.status(204).end(),
    );
    assert.equal((await request(app).post("/weighted").send({ count: 5 })).status, 204);
    assert.equal((await request(app).post("/weighted").send({ count: 1 })).status, 429);
    assert.equal((await request(app).post("/weighted").send({ count: 0 })).status, 204);
  });
});
