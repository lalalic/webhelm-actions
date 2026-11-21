import { waitUntilStable } from "./readiness.mjs";
export const SEND_ENABLED_JS =
  `(() => [...document.querySelectorAll('button[data-testid="send-button"],button[aria-label="Send prompt"],button[aria-label="Send"],form button[type="submit"]')].some(b => b.getClientRects().length > 0 && !b.disabled && b.getAttribute('aria-disabled') !== 'true'))()`;
export const CLICK_SEND_JS =
  `(() => {const b=[...document.querySelectorAll('button[data-testid="send-button"],button[aria-label="Send prompt"],button[aria-label="Send"],form button[type="submit"]')].find(b=>b.getClientRects().length > 0 && !b.disabled && b.getAttribute('aria-disabled') !== 'true');if(!b)return false;b.click();return true;})()`;
export function targetUrl(
  { project_id, thread_id, temporary = false, prompt } = {},
) {
  if (temporary && (project_id || thread_id)) {
    throw new Error(
      "temporary cannot be combined with project_id or thread_id",
    );
  }
  const enc = encodeURIComponent;
  const base = temporary
    ? "https://chatgpt.com/"
    : thread_id
    ? `https://chatgpt.com${project_id ? `/g/${enc(project_id)}` : ""}/c/${
      enc(thread_id)
    }`
    : project_id
    ? `https://chatgpt.com/g/${enc(project_id)}/project`
    : "https://chatgpt.com/";
  const params = new URLSearchParams();
  if (temporary) params.set("temporary-chat", "true");
  if (prompt !== undefined) params.set("prompt", prompt);
  return base + (params.size ? `?${params}` : "");
}
export function visibleDeliveryError(js) {
  return js(
    `(() => { const as=[...document.querySelectorAll('[role="alert"],[role="status"],[data-sonner-toast],[data-testid*="toast"],[class*="toast"],[class*="error-banner"]')]; for(const e of as){if(!e.getClientRects().length)continue; const t=(e.innerText||'').toLowerCase(); if(t.includes('this conversation is too long to continue')||t.includes('conversation is too long to continue'))return 'conversation_too_long'; if(t.includes('could not load this chatgpt conversation'))return 'thread_load_failed';} if((document.body?.innerText||'').toLowerCase().includes('could not load this chatgpt conversation'))return 'thread_load_failed'; return null; })()`,
  );
}
// IMPORTANT: this is the normal URL ?prompt= submission path. Treat page
// location plus the enabled Send button as the readiness signal.
// Do not require an editable composer or wait for ?prompt= to disappear before
// clicking Send. Click only once and return success after the click helper
// completes. The structured @App composer path is an opt-in exception.
export async function prefilledSubmit(helpers, prompt, {
  send = true,
} = {}) {
  const { js } = helpers;
  const sendEnabled = async () => !!(await js(SEND_ENABLED_JS));
  try {
    await waitUntilStable(
      async () => ({ send: await sendEnabled() }),
      (s) => s.send,
      {
        timeout: 15,
        interval: 0.25,
        stableSamples: 3,
        phase: "prefilled Send readiness",
        sleep: helpers.sleep,
      },
    );
  } catch {
    return send
      ? Promise.reject(
        new Error("URL-prefilled Send button was not observed ready"),
      )
      : { send_enabled: false };
  }
  if (!send) return { send_enabled: true };
  // Use WebHelm's real click helper when available. ChatGPT's React
  // composer can ignore synthetic element.click(), even while showing Send.
  // Older/non-browser callers retain the legacy JS-click fallback.
  if (typeof helpers.click === "function") {
    const selectorJS =
      `(() => {const selectors=['button[aria-label="Send"]','button[data-testid="send-button"]','button[aria-label="Send prompt"]','form button[type="submit"]'];const active=b=>!!b&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&b.getClientRects().length>0;for(const s of selectors){const first=document.querySelector(s);if(active(first))return s;const visible=[...document.querySelectorAll(s)].find(active);if(!visible)continue;for(const old of document.querySelectorAll('[data-webhelm-prefilled-send]'))old.removeAttribute('data-webhelm-prefilled-send');visible.setAttribute('data-webhelm-prefilled-send','1');return '[data-webhelm-prefilled-send="1"]';}return null;})()`;
    // ChatGPT may render two identical Send buttons (one hidden, one active).
    // A first-only querySelector misses the active control despite SEND_ENABLED_JS
    // succeeding. Tag only the visible button for a single native helper.click.
    // React can replace or disable Send immediately after initial readiness.
    // this path has not clicked Send yet and must never retry after clicking.
    let selector;
    try {
      const ready = await waitUntilStable(
        async () => ({selector: await js(selectorJS)}),
        state => Boolean(state.selector),
        {timeout: 10, interval: 0.25, stableSamples: 2,
          phase: "prefilled Send recheck", sleep: helpers.sleep},
      );
      selector = ready.selector;
    } catch {
      throw new Error("URL-prefilled Send control was not ready before click");
    }
    if (await helpers.click(selector) === false) {
      throw new Error("URL-prefilled Send click failed");
    }
  } else if (!(await js(CLICK_SEND_JS))) {
    throw new Error("URL-prefilled Send became unavailable before click");
  }
  // A successful single Send click is the complete submission receipt.
  // No input-text, user-turn, Stop, or post-click Send-state checks.
  return { verified_by: "send-clicked", turn: { id: null } };
}
