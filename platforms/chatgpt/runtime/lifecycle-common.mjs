import { waitUntilStable } from "./readiness.mjs";
export const SEND_ENABLED_JS =
  `(() => { const buttons=[...document.querySelectorAll('button[data-testid="send-button"],button[aria-label="Send prompt"],button[aria-label="Send"],form button[type="submit"]')];const b=buttons.find(e=>e.getClientRects().length>0);return !!b&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'; })()`;
export const CLICK_SEND_JS =
  `(() => { const visible=e=>!!e&&!!e.getClientRects().length; const running=[...document.querySelectorAll('button')].some(b=>{ if(!visible(b))return false; const l=(b.getAttribute('aria-label')||'').trim().toLowerCase(),t=(b.getAttribute('title')||'').trim().toLowerCase(),d=(b.getAttribute('data-testid')||'').trim().toLowerCase(); return ['stop generating','stop answering','stop response','stop'].includes(l)||['stop generating','stop answering'].includes(t)||['stop-button','stop-generating-button'].includes(d); }); if(running)return false; const b=document.querySelector('button[data-testid="send-button"],button[aria-label="Send prompt"],button[aria-label="Send"],form button[type="submit"]'); if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')return false; b.click(); return true; })()`;
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
export async function prefilledSubmit(helpers, prompt, {
  send = true, postSubmitTimeout = 30,
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
      `(() => {const selectors=['button[aria-label="Send"]','button[data-testid="send-button"]','button[aria-label="Send prompt"]','form button[type="submit"]'];for(const s of selectors){const b=document.querySelector(s);if(b&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&b.getClientRects().length)return s;}return null;})()`;
    // React can replace or disable the Send control immediately after the
    // initial readiness check. A fresh pre-click readiness probe is safe:
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
    await helpers.click(selector);
  } else if (!(await js(CLICK_SEND_JS))) {
    throw new Error("URL-prefilled Send became unavailable before click");
  }
  // The SPA may accept a turn without immediately displaying it. A failed
  // transient receipt must never trigger another Send click.
  const persistedProbe =
    '(() => [...document.querySelectorAll("h4[data-conversation-role=user]")].some(e => (e.parentElement?.innerText || e.parentElement?.textContent || "").includes(' +
    JSON.stringify(prompt.slice(0, Math.min(prompt.length, 120))) + '))()';
  let verified;
  try {
    verified = await waitUntilStable(
      async () => {
        const turns = await js(`(() => {
          const roles=[...document.querySelectorAll('[data-message-author-role="user"]')]
            .map(e=>(e.innerText||e.textContent||'').trim());
          const headings=[...document.querySelectorAll('h4[data-conversation-role="user"]')]
            .map(e=>(e.parentElement?.innerText||e.parentElement?.textContent||'').trim());
          return roles.concat(headings);
        })()`);
        const accepted = Array.isArray(turns) && turns.some(t => t.includes(prompt.slice(0, Math.min(120, prompt.length))));
        return { send_disabled: !(await sendEnabled()), accepted };
      },
      (s) => s.accepted || s.send_disabled,
      {
        timeout: postSubmitTimeout,
        interval: 0.2,
        stableSamples: 2,
        phase: "post-click Send disabled",
        sleep: helpers.sleep,
      },
    );
  } catch {
    // Verify the saved message in the durable thread by reloading without
    // a prompt query, which cannot submit again.
    if (typeof helpers.page_info === "function" &&
        typeof helpers.goto_url === "function" &&
        typeof helpers.wait_for_load === "function") {
      try {
        const current = new URL((await helpers.page_info()).url);
        if (current.hostname === "chatgpt.com" &&
            current.pathname.split("/c/").length === 2 &&
            current.pathname.split("/c/")[1].length > 0) {
          current.search = "";
          current.hash = "";
          await helpers.goto_url(current.toString());
          await helpers.wait_for_load();
          await waitUntilStable(
            () => js(persistedProbe),
            Boolean, { timeout: 20, interval: 0.3, stableSamples: 2,
              phase: "persisted user turn in durable thread",
              sleep: helpers.sleep },
          );
          return { verified_by: "persisted-user-turn", turn: { id: null } };
        }
      } catch {
        // Still ambiguous: preserve error and never resend.
      }
    }
    const e = new Error("Turn acceptance unverified; delivery may already exist");
    e.name = "SubmissionVerificationError";
    e.diagnostic = { reason: "post_submit_unverified_no_resend" };
    throw e;
  }
  return {
    verified_by: verified.accepted ? "user-turn" : "send-button-disabled",
    turn: { id: null },
  };
}
