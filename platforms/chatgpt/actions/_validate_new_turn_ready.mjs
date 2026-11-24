// Queue gate checks enabled Send. Recovery mode is a read-only same-Thread gate.
// A queue-owned Session is released on NOT_READY and acquired again later.
import {targetUrl,sameChatGPTThreadRoute} from './_action-common.mjs';
import {deliveryMessage} from './_prompt-file.mjs';
import {SEND_ENABLED_JS} from '../runtime/lifecycle-common.mjs';

export async function run({helpers,config={}}) {
  const thread_id=String(config.thread_id||'').trim();
  if (!thread_id) throw Error('thread_id required for readiness gate');
  // Gateway recovery owns the already-open Thread. Do not navigate or prefill
  // during an active generation. Only consider a turn with our exact marker.
  if (config.recovery_response_id !== undefined) {
    const response=String(config.recovery_response_id);
    if(!/^resp_[0-9a-f]{40}$/.test(response))throw Error('invalid recovery response ID');
    const expected=targetUrl({thread_id,project_id:config.project_id||undefined});
    const inspect=async()=>{
      const state=await helpers.js(`(() => {
        const visible=e=>!!e&&e.getClientRects().length>0;
        const marker=${JSON.stringify('reply/models/'+response)};
        const users=[...document.querySelectorAll('[data-message-author-role="user"]')].filter(visible);
        const last=users.at(-1);
        const own=!!last&&(last.innerText||'').includes(marker);
        const stop=[...document.querySelectorAll('button[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="Stop"]')].some(visible);
        const pending=[...document.querySelectorAll('[role="progressbar"],[data-testid="loading-indicator"]')].some(visible);
        const composer=[...document.querySelectorAll('#prompt-textarea,[contenteditable="true"][data-composer-markdown],textarea[aria-label="Ask ChatGPT"]')].some(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true');
        return {url:location.href,own,stop,pending,composer};
      })()`);
      return state?.own===true&&state.stop===false&&state.pending===false&&state.composer===true&&sameChatGPTThreadRoute(expected,state.url);
    };
    // A transient disappearance of Stop is not a ready turn.
    if(!await inspect())return false;
    await new Promise(resolve=>setTimeout(resolve,500));
    return Boolean(await inspect());
  }
  await helpers.goto_url(targetUrl({thread_id,prompt:deliveryMessage(String(config.message||'').trim()||'See attached files.',config.enforcement_context||'')}));
  await helpers.wait_for_load();
  const deadline=Date.now()+12000;
  do {
    if (await helpers.js(SEND_ENABLED_JS)) return true;
    if (Date.now()>=deadline) return false;
    await (helpers.sleep ? helpers.sleep(0.25) : new Promise(resolve=>setTimeout(resolve,250)));
  } while(true);
}
