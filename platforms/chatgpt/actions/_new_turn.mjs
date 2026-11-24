// INVARIANT — ChatGPT URL-prefill delivery contract (newThread/newTurn):
// 1. Use targetUrl(..., prompt) and navigate to the ?prompt= URL. The URL is
//    the submission trigger; do not instead focus/type into an editable composer.
// 2. Observe location and enabled Send button status. ChatGPT can keep
//    ?prompt= until Send is clicked; do not require its removal before clicking.
// 3. Click the enabled Send button AT MOST ONCE and mark submitted.
// 4. Never resend after clicking. Do not replace these checks
//    with composer DOM visibility, contenteditable selection, or text matching.
// 5. A structured @App mention (which edits the composer) is an explicit
//    opt-in exception ONLY; never make it part of the default model route.
// Keep this protocol when refactoring: earlier composer-first changes caused
// "ChatGPT app mention requires a visible composer" in Codex multi-turn runs.

import { statSync } from "node:fs";

// An Action module may be re-imported by the long-running Daemon after an
// update, but Node caches its *static dependencies* by URL. Always resolve the
// current helper revision at invocation time to avoid mixing new Actions with
// stale pre-update helpers (including binary upload and Send receipt logic).
async function currentHelper(relative) {
  const url = new URL(relative, import.meta.url);
  const stat = statSync(url);
  return import(url.href + `?mtime=${stat.mtimeMs}&size=${stat.size}`);
}

import {
  prefilledSubmitWithApp,
  selectChatGPTModel,
  requireNoDeliveryError,
  targetUrl,
} from "./_action-common.mjs";
export async function run({ helpers, config = {} }) {
  // Queue routing belongs to WebHelm; this Action always sends directly.
  if (Object.hasOwn(config,'mode') || Object.hasOwn(config,'sync'))
    throw TypeError('mode is not a browser Action input; use WebHelm Queue or direct Session routing');
  const { deliveryMessage, withPromptFile, uploadAttachments } = await currentHelper("./_prompt-file.mjs");
  const { prefilledSubmit } = await currentHelper("../runtime/lifecycle-common.mjs");
  const project_id=String(config.project_id||'').trim()||null,
    thread_id=String(config.thread_id||'').trim(),
    message=String(config.message??''),
    enforcement_context=config.enforcement_context??'',
    app=String(config.app||'').trim(),
    model_choice=String(config.model_choice||'').trim(),
    files=config.file??[];
  if (!thread_id) throw Error('thread_id is required');
  // Recovery must not navigate away from a still-running or different turn.
  if(config.recovery_response_id!==undefined){
    const {run:validate}=await currentHelper("./_validate_new_turn_ready.mjs");
    if(!await validate({helpers,config}))return {status:"not_ready",thread_id};
  }
  if (!Array.isArray(files) || files.length>4) throw TypeError('file must contain at most four paths');
  if (!message.trim() && !files.length) throw Error('message or file required');
  const prompt=message.trim()?message:'See attached files.';
  const { goto_url, wait_for_load, page_info } = helpers;
  // The thread ID alone is sufficient. ChatGPT may canonicalize this
  // ordinary URL to its Project-scoped /g/<id>[-slug]/c/<thread> URL.
  const url = targetUrl({ thread_id, prompt: deliveryMessage(prompt,enforcement_context) });
  await goto_url(url);
  await wait_for_load();
  await requireNoDeliveryError(helpers);
  // A plain /c/<id>?prompt= URL can canonically redirect to
  // /g/<project-id>[-slug]/c/<id>. Verify the ID, not pathname equality.
  const observedUrl = (await page_info()).url;
  const observedPath = new URL(observedUrl).pathname.replace(/\/$/, "");
  if (decodeURIComponent(observedPath.split("/").pop() || "") !== thread_id ||
      !observedPath.includes("/c/")) {
    throw new Error("ChatGPT thread redirect mismatch");
  }
  const observedScope = observedPath.match(/\/g\/([^/]+)\/c\//)?.[1] || null;
  if (project_id && observedScope &&
      observedScope !== project_id &&
      !observedScope.startsWith(project_id + "-")) {
    throw new Error("ChatGPT thread redirected outside requested Project");
  }
  await requireNoDeliveryError(helpers);
  if(model_choice)await selectChatGPTModel(helpers,model_choice);
  if (files.length) await uploadAttachments(helpers,files);
  const receipt = await withPromptFile(helpers, prompt, content =>
    app ? prefilledSubmitWithApp(helpers, content, app) : prefilledSubmit(helpers, content),
    enforcement_context);
  const canonicalUrl = (await page_info()).url.split("?")[0];
  return {
    status: "submitted",
    mode: "new-turn",
    project_id,
    thread_id,
    thread_url: canonicalUrl,
    verified_by: receipt.verified_by,
    user_message_id: receipt.turn?.id || null,
  };
}
