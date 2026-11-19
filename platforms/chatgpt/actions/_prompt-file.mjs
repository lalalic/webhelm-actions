import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { waitUntilStable } from "../runtime/readiness.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Keep direct ChatGPT Actions aligned with the WebHelm durable queue.
// Large prompts travel as a prompt.md attachment, not as long ?prompt= URLs.
export const PROMPT_FILE_THRESHOLD = 2000;
export const PROMPT_FILE_MESSAGE = "Read prompt.md and execute the task in that file.";
export const deliveryMessage = (message) =>
  message.length > PROMPT_FILE_THRESHOLD ? PROMPT_FILE_MESSAGE : message;

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

// Cleanup happens after the submit callback completes or fails. The complete
// original text never goes through a ChatGPT URL for messages >2000 chars.
export async function withPromptFile(helpers, message, submit) {
  const delivery = deliveryMessage(message);
  if (delivery === message) return await submit(delivery);
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
