import { requireWorkspace, parseDOM } from './_workspace.mjs';
const EFFORTS = ['Extreme-Low', 'Low', 'Medium', 'High', 'Extreme-High'];
/** Non-billable configuration only; never clicks GENERATE or Confirm. */
export default async function configure({ helpers: h, config = {} }) {
  await requireWorkspace(h);
  const effort = config.effort;
  if (typeof effort !== 'string' || !EFFORTS.includes(effort)) throw TypeError('config.effort must be a Gen-2.5 Thinking Effort');
  if (config.agentic !== undefined && typeof config.agentic !== 'boolean') throw TypeError('config.agentic must be a boolean');
  const before = parseDOM(await h.js('({effort:document.querySelector(".rodin-thinking-effort-pill")?.innerText || "",agentic:document.querySelector("[role=switch]")?.getAttribute("aria-checked") || null})'));
  if (config.agentic === false) {
    const off = parseDOM(await h.js(`(() => {
      const sw=document.querySelector('[role="switch"][aria-label="Agentic Mode"]') || document.querySelector('[role="switch"]');
      if(sw?.getAttribute('aria-checked')==='true'){sw.click();return 'switched_off';}
      const exit=document.querySelector('button[aria-label="Exit Agentic Mode"]');
      if(exit){exit.click();return 'exit_agentic';}
      return sw?.getAttribute('aria-checked')==='false' ? 'already_off' : 'unknown';
    })()`));
    if (off === 'unknown') throw Error('Cannot verify Agentic Mode off');
  }
  await h.click('button[aria-label="Open model selection"]');
  const selection = parseDOM(await h.js(`(() => {
    const dialog=document.querySelector('[role="dialog"]');
    if(!dialog)return {ok:false,reason:'model_selection_missing'};
    const effort=${JSON.stringify(effort)};
    const node=[...dialog.querySelectorAll('span')].find(e=>e.children.length===0&&e.textContent.trim()===effort);
    if(!node)return {ok:false,reason:'effort_missing'};
    const clickable=node.parentElement;
    if(!clickable?.classList.contains('group/mode'))return {ok:false,reason:'effort_option_changed'};
    clickable.click();return {ok:true};
  })()`));
  if (!selection?.ok) throw Error(`Cannot set Gen-2.5 effort: ${selection?.reason||'site_changed'}`);
  const after = parseDOM(await h.js(`(() => ({
    effort:(document.querySelector('.rodin-thinking-effort-pill')?.innerText||'').split('\\n').map(x=>x.trim()).filter(Boolean).at(-1),
    agentic:document.querySelector('[role="switch"]')?.getAttribute('aria-checked')||null,
    generationCostText:(document.body.innerText.match(/(?:0\\.5|1(?:\\.0)?)\\s+Credits?/)||[])[0]||null
  }))()`));
  if (after?.effort !== effort || (config.agentic === false && after?.agentic !== 'false')) {
    throw Error('Gen-2.5 settings verification failed');
  }
  return {status:'configured',family:'Gen-2.5',before,after,
    submitted:false,billed:false,source:'visible_creator_controls'};
}
