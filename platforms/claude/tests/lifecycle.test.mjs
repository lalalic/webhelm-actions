import test from "node:test";
import assert from "node:assert/strict";
import { promptUrl, threadIdFromUrl, threadUrl, run } from "../actions/_lifecycle_common.mjs";
const ID = "10631b5b-6ac4-4097-bfee-47098dc4389f";
const MSG = "Integration test response";
test("Claude URL prefill encodes unicode and punctuation, not autosubmit", () => {
  assert.equal(promptUrl("中文 & test?"), "https://claude.ai/new?q=%E4%B8%AD%E6%96%87%20%26%20test%3F");
  assert.throws(() => promptUrl("x".repeat(9001)), /9000/);
  assert.throws(() => promptUrl(" "), /nonempty/);
});
test("Claude canonical thread parsing rejects impostor host, projects, malformed IDs", () => {
  assert.equal(threadIdFromUrl(threadUrl(ID)), ID);
  assert.equal(threadIdFromUrl("https://notclaude.ai/chat/" + ID), null);
  assert.equal(threadIdFromUrl("https://claude.ai/project/abc/chat/" + ID), null);
  assert.equal(threadIdFromUrl("https://claude.ai/chat/foo"), null);
  assert.throws(() => threadUrl("../new"), /UUID/);
});
test("validate rejects unsupported mode without browser mutation", async () => {
  await assert.rejects(run({ message: "test", project_id: ID }, "new-thread", {}),
    /regular Claude|Only regular/);
  await assert.rejects(run({ message: "test", thread_id: "../x" }, "new-turn", {}),
    /UUID/);
});
function mockBrowser(initialUrl = "about:blank") {
  let url = initialUrl, draft = "", users = [], replies = [];
  const events = [];
  const h = {
    events,
    async page_info() { return { url }; },
    async goto_url(next) {
      events.push(["navigate", next]);
      url = next.includes("/new?") ? "https://claude.ai/new" : next;
      draft = next.includes("?q=") ? decodeURIComponent(next.split("?q=")[1]) : "";
    },
    async wait_for_load() {},
    async js() {
      return { url, editor: true, writable: true, draft,
        attachments: false, send: !!draft, users: [...users], replies: [...replies],
        sidebarIds: [] };
    },
    async click(selector) {
      events.push(["click", selector]);
      if (selector.includes("Send message")) {
        users.push(draft);
        draft = "";
        if (url === "https://claude.ai/new") url = threadUrl(ID);
      }
    },
    async cdp(command, args) { assert.equal(command, "Input.insertText"); draft = args.text; },
    async wait() {}
  };
  return { h, setUsers(value) { users = value; }, setReplies(value) { replies = value; } };
}
test("new-thread verifies persisted message and thread before returning submitted", async () => {
  const { h } = mockBrowser();
  const r = await run({ message: MSG, wait: false }, "new-thread", h);
  assert.equal(r.status, "submitted");
  assert.equal(r.thread_id, ID);
  assert.equal(r.submission_verified, true);
  assert.equal(h.events.filter(e => e[1].includes("Send message")).length, 1);
  assert.ok(h.events[0][1].includes("?q="));
});
test("new-turn verifies persisted message in the exact existing chat", async () => {
  const { h, setUsers } = mockBrowser();
  setUsers(["prior prompt"]);
  const r = await run({ message: MSG, thread_id: ID, wait: false }, "new-turn", h);
  assert.equal(r.status, "submitted");
  assert.equal(r.thread_url, threadUrl(ID));
  assert.equal(h.events.filter(e => e[1].includes("Send message")).length, 1);
});
test("resume reads persisted completed answer without clicking Send", async () => {
  const { h, setUsers, setReplies } = mockBrowser(threadUrl(ID));
  setUsers([MSG]);
  setReplies([{ text: '{"ok":true}', streaming: false }]);
  const r = await run({ message: MSG, thread_id: ID, resume: true,
    response_format: "json" }, "new-turn", h);
  assert.equal(r.status, "completed");
  assert.deepEqual(r.data, { ok: true });
  assert.equal(h.events.length, 0);
});
test("resume with wrong last message remains pending and never resends", async () => {
  const { h, setUsers } = mockBrowser(threadUrl(ID));
  setUsers(["different"]);
  const r = await run({ message: MSG, thread_id: ID, resume: true, timeout_seconds: 1 }, "new-turn", h);
  assert.equal(r.status, "pending");
  assert.equal(r.submission_verified, false);
  assert.equal(h.events.length, 0);
});
