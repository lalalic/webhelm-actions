import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { waitUntilStable } from "../runtime/readiness.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Keep direct ChatGPT Actions aligned with the WebHelm durable queue.
// Large prompts travel as a prompt.md attachment, not as long ?prompt= URLs.
export const PROMPT_FILE_THRESHOLD = 2000;
export const PROMPT_FILE_MESSAGE = "Read prompt.md and execute the task in that file.";
// Optional caller-supplied per-request constraints. No service-specific tags,
// response IDs, or protocol parsing belong in WebHelm.
export function enforcementContext(value = '') {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !value.trim() || value.length > 1500 ||
      value.includes('</top-instructions>')) {
    throw new TypeError('enforcement_context must be a non-empty string of at most 1500 characters without closing tag');
  }
  return `<top-instructions>\n${value}\n</top-instructions>`;
}
export function fullDeliveryMessage(message, context = '') {
  const header = enforcementContext(context);
  return (header ? header+'\n\n' : '') + message;
}
export function requiresPromptFile(message, context = '') {
  return fullDeliveryMessage(message, context).length > PROMPT_FILE_THRESHOLD;
}
export function deliveryMessage(message, context = '') {
  const full = fullDeliveryMessage(message, context);
  if (full.length <= PROMPT_FILE_THRESHOLD) return full;
  const header = enforcementContext(context);
  if (!header) return PROMPT_FILE_MESSAGE;
  const short = header+'\n\n'+PROMPT_FILE_MESSAGE;
  if (short.length > PROMPT_FILE_THRESHOLD) throw new TypeError('enforcement_context exceeds the short message limit');
  return short;
}

const FILE_INPUT_JS =
  `(() => ['#upload-files','#upload-media','input[name="upload-media"]','input[type="file"]'].find(s=>document.querySelector(s))||null)()`;
const ADD_FILES_JS =
  `(() => {const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('aria-label')||'').trim()==='Add files and more');if(b)b.click();return !!b;})()`;
const ATTACHMENT_STATE_JS =
  `(() => ({names:[...document.querySelectorAll('button[aria-label^="Remove "]')].map(b=>(b.getAttribute('aria-label')||'').replace(/^Remove file\\s+\\d+:\\s*/,'').replace(/^Remove\\s+/,'')),pending:[...document.querySelectorAll('[role="progressbar"],[aria-busy="true"],[data-state="loading"]')].some(e=>e.getClientRects().length>0)}))()`;

export async function uploadPromptFile(helpers, filePath) {
  if (typeof helpers.upload_file !== "function") {
    throw new Error("ChatGPT large prompt requires the WebHelm upload_file helper");
  }
  let selector = await helpers.js(FILE_INPUT_JS);
  if (!selector) {
    await helpers.js(ADD_FILES_JS);
    for (let i = 0; i < 50 && !selector; i++) {
      await sleep(100);
      selector = await helpers.js(FILE_INPUT_JS);
    }
  }
  if (!selector) throw new Error("ChatGPT file input was not observed");
  await helpers.upload_file(selector, filePath);
  await waitUntilStable(
    async () => await helpers.js(ATTACHMENT_STATE_JS) || { names: [], pending: true },
    (state) => state.names.includes("prompt.md") && !state.pending,
    { timeout: 120, interval: 0.25, stableSamples: 2,
      phase: "prompt.md upload", sleep: helpers.sleep },
  );
}

// Cleanup happens after the submit callback completes or fails. For long
// messages, the composer receives only the bounded protocol header + file
// instruction. The complete original text never goes through the URL.
export async function withPromptFile(helpers, message, submit, context = '') {
  const delivery = deliveryMessage(message,context);
  if (!requiresPromptFile(message,context)) return await submit(delivery);
  const directory = mkdtempSync(join(tmpdir(), "webhelm-prompt-"));
  const file = join(directory, "prompt.md");
  try {
    writeFileSync(file, message, { encoding: "utf8", mode: 0o600 });
    await uploadPromptFile(helpers, file);
    return await submit(delivery);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
