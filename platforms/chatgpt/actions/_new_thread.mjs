// INVARIANT — ChatGPT URL-prefill delivery contract (newThread/newTurn):
// 1. Use targetUrl(..., prompt) and navigate to the ?prompt= URL. The URL is
//    the submission trigger; do not instead focus/type into an editable composer.
// 2. Observe location and enabled Send button status. ChatGPT can keep
//    ?prompt= until Send is clicked; do not require its removal before clicking.
// 3. Click the enabled Send button AT MOST ONCE and mark submitted.
//    Extract the new durable thread ID from the resulting URL.
// 4. Never resend after clicking. Do not replace these checks
//    with composer DOM visibility, contenteditable selection, or text matching.
// 5. A structured @App mention (which edits the composer) is an explicit
//    opt-in exception ONLY; never make it part of the default model route.
// Keep this protocol when refactoring: earlier composer-first changes caused
// "ChatGPT app mention requires a visible composer" in Codex multi-turn runs.

import { statSync } from "node:fs";

// The long-running daemon may have cached an older helper before an Action
// hot-update. Import the current helper revision for each Action invocation.
async function currentHelper(relative) {
  const url = new URL(relative, import.meta.url);
  const stat = statSync(url);
  return import(url.href + `?mtime=${stat.mtimeMs}&size=${stat.size}`);
}
import {
  prefilledSubmitWithApp,
  selectChatGPTModel,
  requireNoDeliveryError,
  sleep,
  targetUrl,
} from "./_action-common.mjs";
export async function run({ helpers, config = {} }) {
  const { deliveryMessage, withPromptFile } = await currentHelper("./_prompt-file.mjs");
  const { prefilledSubmit } = await currentHelper("../runtime/lifecycle-common.mjs");
  // The long-running daemon may still hold an older _action-common module.
  const {sameChatGPTThreadRoute} = await currentHelper("./_action-common.mjs");
  const { js, goto_url, wait_for_load, page_info } = helpers;
  const project_id = String(config.project_id || "").trim() || null,
    message = String(config.message ?? ""),
    enforcement_context = config.enforcement_context ?? "",
    source_thread_id = String(config.source_thread_id || "").trim() || null,
    app = String(config.app || '').trim(),
    model_choice = String(config.model_choice || '').trim(),
    thinking_level = String(config.thinking_level || '').trim(),
    temporary = !!config.temporary;
  if (
    ["job_id", "jobId", "task_id", "taskId", "pr_number", "prNumber"].some(
      (k) => k in config,
    )
  ) throw new Error("new-thread does not accept Job/Task/PR context");
  if ((config.mode ?? "chat") !== "chat") {
    throw new Error("new-thread supports chat mode only");
  }
  if (!message.trim()) throw new Error("message is required");
  if (temporary && project_id) {
    throw new Error("temporary=true cannot be combined with project_id");
  }
  const url = targetUrl({ project_id, temporary, prompt: deliveryMessage(message,enforcement_context) });
  const mode = async () =>
    await js(
      `(() => {const b=[...document.querySelectorAll('button')],f=n=>b.find(x=>(x.textContent||'').trim()===n&&x.hasAttribute('aria-pressed')),c=f('Chat'),w=f('Work');if(!c||!w)return 'unknown';if(c.getAttribute('aria-pressed')==='true'&&w.getAttribute('aria-pressed')==='false')return 'chat';if(w.getAttribute('aria-pressed')==='true'&&c.getAttribute('aria-pressed')==='false')return 'work';return 'unknown';})()`,
    );
  await goto_url(url);
  await wait_for_load();
  await requireNoDeliveryError(helpers);
  if (await mode() === "work") {
    if (
      !await js(
        `(() => {const c=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='Chat'&&b.hasAttribute('aria-pressed'));if(!c||c.disabled)return false;c.click();return true;})()`,
      )
    ) throw new Error("Cannot select Chat mode");
    for (let i = 0; i < 30 && await mode() !== "chat"; i++) await sleep(200);
  }
  if (await mode() !== "chat") {
    const tempMode = temporary &&
      await js(
        `(() => {const t=[...document.querySelectorAll('button')].some(b=>(b.getAttribute('aria-label')||'').toLowerCase().includes('turn off temporary chat'));const c=[...document.querySelectorAll('[role="textbox"],textarea')].some(e=>(e.getAttribute('aria-label')||'').trim()==='Ask ChatGPT');return t&&c;})()`,
      );
    // The current Project/home Chat view sometimes omits Chat/Work mode
    // toggles entirely. In that case it is still the ordinary Chat landing
    // view (not Work) when the project/root URL and New chat control agree.
    // This is MODE verification, never submission readiness: the prompt URL,
    // enabled Send and Stop checks remain owned by prefilledSubmit below.
    const implicitChatMode = !temporary && await js(
      `(() => {const b=[...document.querySelectorAll('button')],m=b.filter(x=>['Chat','Work'].includes((x.textContent||'').trim())&&x.hasAttribute('aria-pressed')),work=m.find(x=>(x.textContent||'').trim()==='Work'),path=location.pathname;return location.hostname==='chatgpt.com'&&m.length===0&&(!work||work.getAttribute('aria-pressed')!=='true')&&(path==='/'||/^\/g\/g-p-[A-Za-z0-9_-]+\/?$/.test(path))&&b.some(x=>(x.textContent||'').trim()==='New chat'||x.getAttribute('aria-label')==='New chat');})()`,
    );
    if (!tempMode && !implicitChatMode) {
      throw new Error("new-thread Chat mode could not be verified");
    }
  }
  if (!temporary) {
    await goto_url(url);
    await wait_for_load();
  }
  if (
    temporary &&
    !await js(
      `(() => location.search.includes('temporary-chat=true')||[...document.querySelectorAll('button')].some(b=>(b.getAttribute('aria-label')||'').toLowerCase().includes('turn off temporary chat')||(b.textContent||'').trim().toLowerCase()==='turn off temporary chat')||[...document.querySelectorAll('h1')].some(h=>(h.textContent||'').trim().toLowerCase()==='temporary chat'))()`,
    )
  ) throw new Error("ChatGPT Temporary Chat mode was not activated");
  await requireNoDeliveryError(helpers);
  if(model_choice)await selectChatGPTModel(helpers,model_choice);
  // Optional thinking selection must never prevent URL-prefill submission.
  let thinking = {status:"not-requested"};
  if (thinking_level) {
    try {
      const {bestEffortThinkingLevel} = await currentHelper("./_thinking-level.mjs");
      thinking = await bestEffortThinkingLevel(helpers, thinking_level);
    } catch (error) {
      thinking = {status:"skipped",requested:thinking_level,warning:String(error?.message||error).slice(0,200)};
    }
  }
  const receipt = await withPromptFile(helpers, message, prompt =>
    app ? prefilledSubmitWithApp(helpers, prompt, app) : prefilledSubmit(helpers, prompt),
    enforcement_context);
  if (temporary) {
    return {
      status: "submitted",
      mode: "new-thread",
      temporary: true,
      project_id: null,
      source_thread_id,
      thread_id: null,
      thread_url: null,
      thinking,
      verified_by: receipt.verified_by,
      user_message_id: receipt.turn?.id || null,
    };
  }
  const end = Date.now() + 60000;
  let thread_id = null, thread_url = null;
  while (Date.now() < end) {
    const current = (await page_info()).url.split("?")[0],
      path = new URL(current).pathname.replace(/\/$/, "");
    if (path.includes("/c/") && !current.includes("local-chatgpt")) {
      thread_id = path.split("/").pop();
      thread_url = current;
      if (thread_id) break;
    }
    await sleep(200);
  }
  if (!thread_id) {
    // A caller-owned session can recover the URL read-only, without a second Send.
    if (config.recover_thread_receipt === true) return {
      status: "submitted", mode: "new-thread", temporary: false, project_id,
      thread_id: null, thread_url: null, verified_by: receipt.verified_by,
      receipt_pending: true, thinking,
    };
    throw new Error('ChatGPT did not assign a durable thread id after Send click');
  }
  // Canonical Project URLs may append -<slug>, but a different Project
  // whose ID merely starts with the expected ID is never acceptable.
  if(project_id && !sameChatGPTThreadRoute(
    `https://chatgpt.com/g/${encodeURIComponent(project_id)}/c/${encodeURIComponent(thread_id)}`,
    thread_url,
  )) throw new Error("ChatGPT new thread is not inside the requested Project");
  return {
    status: "submitted",
    mode: "new-thread",
    temporary: false,
    project_id,
    source_thread_id,
    thread_id,
    thread_url,
    thinking,
    verified_by: receipt.verified_by,
    user_message_id: receipt.turn?.id || null,
  };
}
