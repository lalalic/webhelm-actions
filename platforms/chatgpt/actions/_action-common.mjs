import { promptTextMatches, waitUntilStable } from "../runtime/readiness.mjs";
import {
  prefilledSubmit,
  targetUrl,
  visibleDeliveryError,
} from "../runtime/lifecycle-common.mjs";
export {
  prefilledSubmit,
  promptTextMatches,
  targetUrl,
  visibleDeliveryError,
  waitUntilStable,
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const text = (v) => String(v ?? "").trim();
export const pathThreadId = (url) => {
  const m = String(url).match(/\/c\/([^/?#]+)/);
  return m?.[1] || null;
};
// ChatGPT may canonicalize /g/<project-id>/c/<thread> to
// /g/<project-id>-<slug>/c/<thread>.  Compare exact thread IDs and a
// segment-delimited Project identity, never the entire pathname string.
// A bare /c/<thread> may redirect into a Project; a scoped destination must
// never silently redirect to an unscoped/different Project or another Thread.
export function sameChatGPTThreadRoute(expected,observed) {
  const parse = value => {
    let url;
    try { url = new URL(value); } catch { return null; }
    if(url.protocol!=='https:'||url.hostname!=='chatgpt.com'||url.username||url.password||url.port)
      return null;
    const parts=url.pathname.split('/').filter(Boolean);
    if(parts.length===2&&parts[0]==='c'&&parts[1])
      return {thread:parts[1],project:null};
    if(parts.length===4&&parts[0]==='g'&&parts[1]&&parts[2]==='c'&&parts[3])
      return {thread:parts[3],project:parts[1]};
    return null;
  };
  const target=parse(expected),actual=parse(observed);
  if(!target||!actual||target.thread!==actual.thread)return false;
  return !target.project||actual.project===target.project||
    !!actual.project&&actual.project.startsWith(target.project+'-');
}

export async function requireNoDeliveryError(helpers) {
  const err = await visibleDeliveryError(helpers.js);
  if (err) throw new Error(`ChatGPT visible delivery error: ${err}`);
}
export const SEND_READY_JS =
  `(() => { const b=document.querySelector('button[data-testid="send-button"],button[aria-label="Send prompt"],button[aria-label="Send"],form button[type="submit"]'); return !!b&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'; })()`;
export const USER_TURNS_JS =
  `(() => { const old=[...document.querySelectorAll('[data-message-author-role="user"]')].map(e=>({text:(e.innerText||'').trim(),id:e.getAttribute('data-message-id')||''})).filter(x=>x.text); if(old.length)return old;return [...document.querySelectorAll('h4')].filter(e=>(e.innerText||'').trim()==='You said:').map((e,i)=>({text:(e.parentElement?.innerText||'').replace(/^You said:\\s*/,'').trim(),id:'dom-user-'+i})).filter(x=>x.text); })()`;
export const ASSISTANT_TURNS_JS =
  `(() => { const old=[...document.querySelectorAll('[data-message-author-role="assistant"]')].map(e=>({text:(e.innerText||'').trim(),id:e.getAttribute('data-message-id')||''})).filter(x=>x.text); if(old.length)return old;return [...document.querySelectorAll('h4')].filter(e=>(e.innerText||'').trim()==='ChatGPT said:').map((e,i)=>({text:(e.parentElement?.innerText||'').replace(/^ChatGPT said:\\s*/,'').trim(),id:'dom-assistant-'+i})).filter(x=>x.text); })()`;
export const COMPOSER_JS =
  `(() => { const ss=['#prompt-textarea','[contenteditable="true"][data-composer-markdown]','[contenteditable="true"][data-lexical-editor="true"]','textarea'];for(const s of ss){const e=document.querySelector(s);if(!e||e.disabled||['pending-home-input','pending-conversation-input'].includes(e.id))continue;const r=e.getBoundingClientRect();if(r.width>0&&r.height>0)return s;}const v=[...document.querySelectorAll('[contenteditable="true"]')].filter(e=>!e.disabled&& !['pending-home-input','pending-conversation-input'].includes(e.id)&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);return v.length===1?'[contenteditable="true"]':null; })()`;
export async function composerText(helpers, selector) {
  return await helpers.js(
    `(() => {const e=document.querySelector(${
      JSON.stringify(selector)
    });if(!e)return '';if(e.getAttribute('contenteditable')!=='true')return e.value||'';const c=e.cloneNode(true);c.querySelectorAll('[app-mention-name]').forEach(n=>n.remove());return (c.innerText||c.textContent||'').trim();})()`,
  ) || "";
}
export async function setField(helpers, selector, value) {
  const ok = await helpers.js(
    `(() => {const e=document.querySelector(${
      JSON.stringify(selector)
    });if(!e)return false;e.focus();if(e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement){const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value')?.set?.call(e,${
      JSON.stringify(value)
    });}else{const s=window.getSelection(),r=document.createRange();r.selectNodeContents(e);s.removeAllRanges();s.addRange(r);document.execCommand('delete',false,null);document.execCommand('insertText',false,${
      JSON.stringify(value)
    });s.removeAllRanges();}e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:${
      JSON.stringify(value)
    }}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`,
  );
  if (!ok) throw new Error("composer could not be filled");
}

export async function attachAppMention(
  helpers,
  selector,
  targetId,
  name,
  { timeout = 10 } = {},
) {
  const app = String(name || "").trim();
  if (!app) return false;
  const cleared = await helpers.js(
    `(() => {const e=document.querySelector(${
      JSON.stringify(selector)
    });if(!e||e.getAttribute('contenteditable')!=='true')return false;e.focus();const s=window.getSelection(),r=document.createRange();r.selectNodeContents(e);s.removeAllRanges();s.addRange(r);document.execCommand('delete',false,null);return true;})()`,
  );
  if (!cleared) {
    throw new Error(
      "ChatGPT app mention requires a visible contenteditable composer",
    );
  }
  await helpers.cdp("Input.insertText", { text: "@" });
  const wanted = app.toLowerCase(), end = Date.now() + timeout * 1000;
  let found = false;
  while (Date.now() < end) {
    found = await helpers.js(
      `(() => {const wanted=${
        JSON.stringify(wanted)
      },nodes=[...document.querySelectorAll('button,[role="option"],[role="menuitem"]')],e=nodes.find(n=>{const t=(n.innerText||n.textContent||'').replace(/\\s+/g,'').trim().toLowerCase();return t===wanted.replace(/\\s+/g,'')||t===(wanted+wanted).replace(/\\s+/g,'')});if(!e)return false;e.click();return true;})()`,
    );
    if (found) break;
    await sleep(100);
  }
  if (!found) {
    throw new Error(`ChatGPT app '${app}' was not offered by the composer`);
  }
  while (Date.now() < end) {
    if (
      await helpers.js(
        `(() => {const e=document.querySelector(${
          JSON.stringify(selector)
        });return !!e&&!![...e.querySelectorAll('[app-mention-name]')].find(n=>(n.getAttribute('app-mention-name')||'').toLowerCase()===${
          JSON.stringify(wanted)
        });})()`,
      )
    ) return true;
    await sleep(100);
  }
  throw new Error(`ChatGPT app '${app}' mention did not attach`);
}


/** A structured App mention is required for the App's tool permissions.
 * Plain `@App` text is not an equivalent authorization; the composer must
 * contain an `app-mention-name` element before submitting the prompt.
 */
export async function prefilledSubmitWithApp(helpers,prompt,app=''){
  if(!app)return prefilledSubmit(helpers,prompt);
  const selector=await helpers.js(COMPOSER_JS);
  if(!selector)throw Error('ChatGPT app mention requires a visible composer');
  await attachAppMention(helpers,selector,helpers.target_id||null,app,{timeout:15});
  for(let i=0;i<prompt.length;i+=200){
    const chunk=prompt.slice(i,i+200);
    const ok=await helpers.js(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.focus();const s=window.getSelection(),r=document.createRange();r.selectNodeContents(e);r.collapse(false);s.removeAllRanges();s.addRange(r);const success=document.execCommand('insertText',false,${JSON.stringify(chunk)});e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:${JSON.stringify(chunk)}}));return success;})()`);
    if(!ok)throw Error('ChatGPT app mention composer rejected prompt text');
  }
  const mention=await helpers.js(`(() => {const e=document.querySelector(${JSON.stringify(selector)});return !!e&&[...e.querySelectorAll('[app-mention-name]')].some(n=>(n.getAttribute('app-mention-name')||'').toLowerCase()===${JSON.stringify(app.toLowerCase())});})()`);
  if(!mention)throw Error('ChatGPT composer lost the structured app mention');
  return prefilledSubmit(helpers,prompt);
}


/** Optional per-request ChatGPT model selection. Caller owns its choice. */
export async function selectChatGPTModel(helpers,model='') {
  if(!model)return;
  const {js,click}=helpers;
  // In concurrent native Codex title + main requests the SPA can remain
  // unhydrated after navigation; wait for actual picker readiness.
  await waitUntilStable(async()=>({ready:await js(`(() => {
    const b=document.querySelector('button[aria-label="Select ChatGPT model"]');
    return !!b&&!b.disabled&&b.getClientRects().length>0;
  })()`)}),state=>Boolean(state.ready),
    {timeout:45,interval:.3,stableSamples:2,phase:'model picker readiness',sleep:helpers.sleep});
  await click('button[aria-label="Select ChatGPT model"]');
  const menu=await waitUntilStable(async()=>({choices:await js(`(() => [...document.querySelectorAll('[role="menuitemradio"]')].map(e=>(e.innerText||'').trim()))()`)||[]}),
    state=>state.choices.includes(model),{timeout:10,interval:.2,stableSamples:2,phase:'model selection menu',sleep:helpers.sleep});
  const tagged=await js(`(() => {const e=[...document.querySelectorAll('[role="menuitemradio"]')].find(x=>(x.innerText||'').trim()===${JSON.stringify(model)});if(!e)return false;e.setAttribute('data-webhelm-model-choice','yes');return true})()`);
  if(!tagged)throw Error('requested ChatGPT model not found: '+model);
  await click('[data-webhelm-model-choice="yes"]');
  await waitUntilStable(async()=>({caption:await js(`document.querySelector('button[aria-label="Select ChatGPT model"]')?.innerText`)}),
    state=>model==='GPT-5.6 Sol'?String(state.caption).includes('5.6'):model==='GPT-6'?(!String(state.caption).includes('5.6')&&String(state.caption).includes('Thinking effort')):String(state.caption).includes(model),
    {timeout:10,interval:.2,stableSamples:2,phase:'model selection verified',sleep:helpers.sleep});
}
