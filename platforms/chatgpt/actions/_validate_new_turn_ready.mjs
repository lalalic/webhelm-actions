// Read-only Queue gate: does NOT send, inspect content, or check Stop state.
// A queue-owned Session is released on NOT_READY and acquired again later.
import {targetUrl} from './_action-common.mjs';
import {deliveryMessage} from './_prompt-file.mjs';
import {SEND_ENABLED_JS} from '../runtime/lifecycle-common.mjs';

export async function run({helpers,config={}}) {
  const thread_id=String(config.thread_id||'').trim();
  if (!thread_id) throw Error('thread_id required for readiness gate');
  await helpers.goto_url(targetUrl({thread_id,prompt:deliveryMessage(String(config.message||'').trim()||'See attached files.',config.enforcement_context||'')}));
  await helpers.wait_for_load();
  const deadline=Date.now()+12000;
  do {
    if (await helpers.js(SEND_ENABLED_JS)) return true;
    if (Date.now()>=deadline) return false;
    await (helpers.sleep ? helpers.sleep(0.25) : new Promise(resolve=>setTimeout(resolve,250)));
  } while(true);
}
