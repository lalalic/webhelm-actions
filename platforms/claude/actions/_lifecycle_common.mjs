const BASE = "https://claude.ai";
const EDITOR = '[data-testid="chat-input"]';
const SEND = 'button[aria-label="Send message"]';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function threadIdFromUrl(value) {
  try {
    const u = new URL(value);
    const match = u.pathname.match(/^\/chat\/([0-9a-f-]+)\/?$/i);
    return u.hostname === "claude.ai" && match && UUID.test(match[1]) ? match[1] : null;
  } catch { return null; }
}
export function threadUrl(id) {
  if (typeof id !== "string" || !UUID.test(id)) {
    throw new TypeError("thread_id must be a Claude chat UUID");
  }
  return BASE + "/chat/" + id;
}
export function promptUrl(message) {
  if (typeof message !== "string" || !message.trim()) {
    throw new TypeError("message must be a nonempty string");
  }
  if (message.length > 9000) {
    throw new TypeError("Claude URL prefill limited to 9000 characters");
  }
  return BASE + "/new?q=" + encodeURIComponent(message);
}
const READ_STATE = "(" + function () {
  const editor = document.querySelector('[data-testid="chat-input"]');
  const users = [...document.querySelectorAll('[data-cds="UserMessage"]')]
    .map(e => e.querySelector('[data-testid="user-message"]')?.innerText.trim() || '');
  const replies = [...document.querySelectorAll('[data-testid="assistant-message"]')]
    .map(e => ({
      text: e.querySelector('[data-cds="Prose"]')?.innerText.trim() || '',
      streaming: e.getAttribute('data-is-streaming') !== 'false',
    }));
  return {
    url: location.href, editor: !!editor,
    writable: editor?.getAttribute('contenteditable') === 'true',
    draft: editor?.innerText.trim() || '',
    attachments: [...document.querySelectorAll('input[type=file]')].some(e => e.files?.length),
    send: !!document.querySelector('button[aria-label="Send message"]:not([disabled])'),
    users, replies,
    sidebarIds: [...document.querySelectorAll('a[href^="/chat/"]')]
      .map(a => a.getAttribute('href')?.split('/')[2]).filter(Boolean),
  };
}.toString() + ")()";
const state = h => h.js(READ_STATE);
const pause = h => h.wait(0.5);
async function waitWritable(h, deadline) {
  while (Date.now() < deadline) {
    const s = await state(h);
    if (s.editor && s.writable) return s;
    await pause(h);
  }
  throw new Error("Claude composer did not become writable");
}
function assertIdle(s) {
  if (s.draft || s.attachments) {
    throw new Error("Unsent Claude draft or attachment; leave untouched");
  }
}
function receipt(mode, id, message, status, extra = {}) {
  return { status, mode, thread_id: id, thread_url: id ? threadUrl(id) : null,
    submission_verified: status === "submitted" || status === "completed",
    message, ...extra };
}
function parseAnswer(cfg, output) {
  if (cfg.response_format === "json") {
    try { output.data = JSON.parse(output.answer); }
    catch (error) { output.data = null; output.parse_error = error.message; }
  }
  return output;
}
function validate(cfg, mode) {
  if (!cfg || typeof cfg !== "object") throw new TypeError("config required");
  const timeout = Number(cfg.timeout_seconds ?? 90);
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300) {
    throw new TypeError("timeout_seconds must be between 1 and 300");
  }
  if (!["text", "json"].includes(cfg.response_format ?? "text")) {
    throw new TypeError("response_format must be text or json");
  }
  if (cfg.project_id || cfg.temporary || (cfg.mode ?? "chat") !== "chat") {
    throw new TypeError("Only regular Claude chats are supported");
  }
  if (!["new-thread", "new-turn"].includes(mode)) throw new TypeError("invalid mode");
  if (typeof cfg.message !== "string" || !cfg.message.trim()) {
    throw new TypeError("message required");
  }
  if (!cfg.resume && mode === "new-thread") promptUrl(cfg.message);
  if (mode === "new-turn" || cfg.resume) threadUrl(cfg.thread_id);
  return timeout;
}
async function completed(h, cfg, saved, answersBefore, deadline) {
  if (cfg.wait === false) return saved;
  while (Date.now() < deadline) {
    const s = await state(h);
    if (threadIdFromUrl(s.url) !== saved.thread_id) {
      throw new Error("Claude thread changed while waiting for answer");
    }
    if (s.replies.length > answersBefore) {
      const last = s.replies.at(-1);
      if (!last.streaming && last.text) {
        return parseAnswer(cfg, { ...saved, status: "completed", answer: last.text,
          answer_verified_by: "Claude completed assistant message" });
      }
    }
    await pause(h);
  }
  return { ...saved, status: "pending",
    next_step: "Resume read-only with thread_id and message; do not resubmit" };
}
export async function run(cfg, mode, h) {
  const timeout = validate(cfg, mode);
  const message = cfg.message.trim();
  const deadline = Date.now() + timeout * 1000;
  if (cfg.resume) {
    const id = cfg.thread_id;
    if (threadIdFromUrl((await h.page_info()).url) !== id) {
      await h.goto_url(threadUrl(id)); await h.wait_for_load();
    }
    let s = await state(h);
    // Claude may render an empty transcript briefly after navigation.
    const hydrationDeadline = Math.min(deadline, Date.now() + 8000);
    while (s.users.at(-1) !== message && Date.now() < hydrationDeadline) {
      await pause(h);
      s = await state(h);
    }
    if (s.users.at(-1) !== message) {
      return receipt(mode, id, message, "pending", {
        submission_verified: false,
        next_step: "Last persisted message does not match; do not resubmit" });
    }
    const saved = receipt(mode, id, message, "submitted", {
      verified_by: "Persisted last Claude user message; no resend" });
    if (s.replies.length >= s.users.length && s.replies.at(-1)?.text &&
        !s.replies.at(-1)?.streaming) {
      return parseAnswer(cfg, { ...saved, status: "completed",
        answer: s.replies.at(-1).text,
        answer_verified_by: "Persisted Claude assistant response" });
    }
    return completed(h, cfg, saved, s.replies.length, deadline);
  }
  const current = await h.page_info();
  if (new URL(current.url).hostname === "claude.ai") {
    assertIdle(await state(h));
  }
  const expected = mode === "new-turn" ? cfg.thread_id : null;
  await h.goto_url(expected ? threadUrl(expected) : promptUrl(message));
  await h.wait_for_load();
  const before = await waitWritable(h, deadline);
  if (expected && threadIdFromUrl(before.url) !== expected) {
    throw new Error("Claude opened the wrong thread; nothing submitted");
  }
  if (!expected && threadIdFromUrl(before.url)) {
    throw new Error("Claude opened an existing thread; nothing submitted");
  }
  if (!expected) {
    if (before.draft !== message) {
      throw new Error("Claude URL prefill missing or altered; nothing submitted");
    }
  } else {
    assertIdle(before);
    await h.click(EDITOR);
    if (typeof h.cdp === "function") {
      await h.cdp("Input.insertText", { text: message });
    } else {
      await h.fill_input(EDITOR, message);
    }
  }
  const ready = await state(h);
  if (ready.draft !== message || !ready.send || !ready.writable) {
    throw new Error("Claude composer does not contain exact message; nothing submitted");
  }
  const baselineUsers = before.users.length;
  const baselineAnswers = before.replies.length;
  const oldIds = new Set(before.sidebarIds);
  await h.click(SEND);
  let refreshed = false;
  const refreshAfter = Date.now() + 3500;
  while (Date.now() < deadline) {
    const s = await state(h);
    let id = threadIdFromUrl(s.url);
    if (expected && id && id !== expected) {
      throw new Error("Claude navigated to an unexpected thread; do not resubmit");
    }
    if (expected && id === expected && s.users.length > baselineUsers &&
        s.users.at(-1) === message) {
      const saved = receipt(mode, id, message, "submitted", {
        verified_by: "Exact persisted user message in requested Claude thread" });
      return completed(h, cfg, saved, baselineAnswers, deadline);
    }
    if (!expected) {
      const candidates = id ? [id] : [...new Set(s.sidebarIds)]
        .filter(x => !oldIds.has(x) && UUID.test(x));
      if (candidates.length === 1 && !s.draft) {
        id = candidates[0];
        if (threadIdFromUrl(s.url) !== id) {
          await h.goto_url(threadUrl(id)); await h.wait_for_load();
        }
        const persisted = await state(h);
        if (persisted.users.includes(message)) {
          const saved = receipt(mode, id, message, "submitted", {
            verified_by: "New Claude thread URL and persisted exact user message" });
          return completed(h, cfg, saved, 0, deadline);
        }
      }
    }
    if (!refreshed && !s.draft && Date.now() >= refreshAfter) {
      refreshed = true;
      await h.goto_url(expected ? threadUrl(expected) : BASE + "/new");
      await h.wait_for_load();
    }
    await pause(h);
  }
  return receipt(mode, expected, message, "pending", {
    submission_verified: false,
    next_step: "Submission unverified; inspect Claude and resume read-only; do not resend blindly" });
}