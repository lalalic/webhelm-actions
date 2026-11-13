import {sleep} from '../../_action_helpers.mjs';

const STUDIO_URL='https://studio.youtube.com/';

export function classifyYoutubeStudioHeartbeat(page) {
  let url;
  try { url=new URL(page?.url||''); } catch { return 'unknown'; }
  if (url.hostname==='accounts.google.com' ||
      /(^|\/)(signin|login|ServiceLogin)(\/|$)/i.test(url.pathname)) return 'login_required';
  if (url.protocol!=='https:' || url.hostname!=='studio.youtube.com') return 'unknown';
  const text=String(page?.body||'');
  if (/Sign in to YouTube|Sign in to continue|Sign in with Google/i.test(text)) return 'login_required';
  if (!/^\/channel\/[^/?#]+/.test(url.pathname)) return 'unknown';
  // The redirect to a channel URL or YouTube Studio title is not sufficient:
  // an authenticated channel dashboard must have hydrated Studio controls.
  if (page?.hasStudioApp && page?.hasDashboard &&
      /Channel dashboard|Your channel|Channel content/i.test(text) &&
      /Upload videos|Create/i.test(text)) return 'alive';
  return 'unknown';
}

export default async function heartbeat({helpers:h}) {
  if (!(await h.page_info()).url.startsWith(STUDIO_URL)) await h.goto_url(STUDIO_URL);
  await h.wait_for_load?.(12000).catch(()=>{});
  let status='unknown';
  for(let attempt=0;attempt<15;attempt++) {
    const page=await h.js(`(()=>({url:location.href,body:(document.body?.innerText||'').slice(0,7000),hasStudioApp:!!document.querySelector('ytcp-app'),hasDashboard:!!document.querySelector('ytcp-entity-page,ytcp-header')}))()`);
    status=classifyYoutubeStudioHeartbeat(page);
    if(status!=='unknown')break;
    if(attempt<14)await sleep(800);
  }
  return {status};
}
