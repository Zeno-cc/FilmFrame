import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";

import { renderAdminPage } from "../src/views/html.js";
import { adminSettingsScript } from "../src/views/adminSettingsView.js";
import { adminUpdateScript } from "../src/views/adminUpdateView.js";

// A small DOM double for executing the rendered revocation handlers without a browser.
class Element {
  dataset: Record<string, string> = {};
  textContent = "";
  className = "";
  value = "all";
  disabled = false;
  hidden = false;
  parent: Element | null = null;
  children: Element[] = [];
  listeners = new Map<string, (event: { target: Element }) => unknown>();
  selections = new Map<string, Element[]>();

  constructor(readonly tag = "div") {}
  addEventListener(type: string, listener: (event: { target: Element }) => unknown) {
    this.listeners.set(type, listener);
  }
  querySelectorAll(selector: string) { return this.selections.get(selector) ?? []; }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  replaceChildren(...children: Element[]) { this.children = children; }
  closest(selector: string): Element | null {
    if (selector === this.tag || (selector.startsWith(".") && this.className.split(" ").includes(selector.slice(1)))) return this;
    return this.parent?.closest(selector) ?? null;
  }
}

function row(kind: "invite" | "session" | "passkey" | "batch", id: string, inviteId = id) {
  const node = new Element("tr");
  node.dataset = { recordId: id, id, inviteId, status: "active", batchId: "batch", batchRecord: id };
  const button = new Element("button");
  button.className = kind === "invite" ? "revoke" : `revoke-${kind}`;
  button.dataset = { id, count: "2", sessions: "3", name: "Batch" };
  button.parent = node;
  node.selections.set(`.${button.className}`, [button]);
  for (const selector of [".record-status", ".record-redeemable", ".invite-sessions", ".batch-sessions", ".status"]) {
    const cell = new Element();
    cell.textContent = "有效";
    cell.className = "status active";
    node.selections.set(selector, [cell]);
  }
  return { node, button };
}

function fixture() {
  const nodes = new Map<string, Element>();
  const byId = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id)!;
  };
  const invite = row("invite", "invite-a"), sibling = row("invite", "invite-b");
  const sessions = [row("session", "s1", "invite-a"), row("session", "s2", "invite-a"), row("session", "s3", "invite-b")];
  const passkeys = [row("passkey", "p1", "invite-a"), row("passkey", "p2", "invite-b")];
  const batch = row("batch", "batch");
  invite.node.querySelector(".invite-sessions")!.textContent = "2";
  sibling.node.querySelector(".invite-sessions")!.textContent = "1";
  batch.node.querySelector(".batch-sessions")!.textContent = "3";
  byId("invite-list").selections.set("tr[data-record-id]", [invite.node, sibling.node]);
  byId("invite-list").selections.set("tr[data-batch-id]", [invite.node, sibling.node]);
  byId("session-list").selections.set("tr[data-invite-id]", sessions.map(({ node }) => node));
  byId("passkey-list").selections.set("tr[data-invite-id]", passkeys.map(({ node }) => node));
  byId("batch-list").selections.set("tr[data-batch-record]", [batch.node]);
  byId("invite-search").value = "";
  const html = renderAdminPage({
    nonce: "test-nonce", invites: [], batches: [], sessions: [], passkeys: [],
    renderBudget: { maxCanvasMiB: 700, maxCanvasBytes: 700 * 1024 * 1024, updatedAt: 0 },
  });
  const script = /<script nonce="test-nonce">([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(script);
  const requests: string[] = [];
  runInNewContext(script.replace(adminSettingsScript, "").replace(adminUpdateScript, ""), {
    Element,
    document: {
      getElementById: byId,
      querySelectorAll: () => [],
      createElement: () => new Element(),
    },
    window: { addEventListener() {} },
    confirm: () => true,
    fetch: async (path: string) => {
      requests.push(path);
      return { ok: true, json: async () => ({ revokedInviteCount: 2, revokedSessionCount: 3 }) };
    },
  });
  const click = async (list: string, button: Element) => {
    await byId(list).listeners.get("click")!({ target: button });
  };
  return { invite, sibling, sessions, passkeys, batch, click, requests };
}

describe("administrator revocation view", () => {
  it("updates batch totals and child Passkeys after revoking one invitation", async () => {
    const view = fixture();
    await view.click("invite-list", view.invite.button);
    assert.deepEqual(view.requests, ["/api/invites/invite-a/revoke"]);
    assert.equal(view.batch.node.querySelector(".batch-sessions")!.textContent, "1");
    assert.equal(view.batch.button.dataset.sessions, "1");
    assert.equal(view.invite.node.querySelector(".invite-sessions")!.textContent, "0");
    assert.equal(view.sessions[0]!.node.dataset.status, "revoked");
    assert.equal(view.sessions[2]!.node.dataset.status, "active");
    assert.equal(view.passkeys[0]!.button.disabled, true);
    assert.equal(view.passkeys[0]!.node.querySelector(".status")!.className, "status revoked");
    assert.equal(view.passkeys[1]!.button.disabled, false);
  });

  it("marks every child Passkey revoked when revoking a batch", async () => {
    const view = fixture();
    await view.click("batch-list", view.batch.button);
    assert.deepEqual(view.requests, ["/api/invite-batches/batch/revoke"]);
    for (const passkey of view.passkeys) {
      assert.equal(passkey.button.disabled, true);
      assert.equal(passkey.node.querySelector(".status")!.textContent, "已撤销");
    }
    assert.equal(view.batch.node.querySelector(".batch-sessions")!.textContent, "0");
  });

  it("updates the status badge after revoking an individual Passkey", async () => {
    const view = fixture();
    await view.click("passkey-list", view.passkeys[0]!.button);
    assert.deepEqual(view.requests, ["/api/passkeys/p1/revoke"]);
    assert.equal(view.passkeys[0]!.node.querySelector(".status")!.className, "status revoked");
    assert.equal(view.passkeys[1]!.button.disabled, false);
    assert.equal(view.sessions[0]!.node.dataset.status, "active");
  });
});
