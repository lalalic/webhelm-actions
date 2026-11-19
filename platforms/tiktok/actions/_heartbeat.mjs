import {sleep} from '../../_action_helpers.mjs';

const STUDIO_URL='https://www.tiktok.com/tiktokstudio/upload';

export function classifyTiktokStudioHeartbeat(page) {
  let url;
  try {url=new URL(page?.url||'');}catch{return 'unknown';}
  if (url.protocol!=='https:' || !['www.tiktok.com','tiktok.com'].includes(url.hostname))
    return 'unknown';
  if (/(^|\/)(login|signin)(\/|$)/i.test(url.pathname)) return 'login_required';
  const text=String(page?.body||'');
  if (/Log in to TikTok|Log in to continue|Sign up for TikTok/i.test(text)) return 'login_required';
  if (!url.pathname.startsWith('/tiktokstudio')) return 'unknown';
  // Need visible Studio navigation and a specific signed-in account link;
  // the page title or an unhydrated shell does not prove authentication.
  const studioNavigation = /Posts/.test(text) && /Analytics/.test(text);
  // The authenticated upload form is a stronger signal than the account link:
  // TikTok Studio's upload view often does not render a profile <a> link.
  if (url.pathname === '/tiktokstudio/upload' && studioNavigation &&
      page?.hasUpload && page?.hasUploadForm) return 'alive';
  if (page?.hasAccount && page?.hasUpload && studioNavigation) return 'alive';
  return 'unknown';
}

export default async function heartbeat({helpers:h}) {
  if (!(await h.page_info()).url.startsWith(STUDIO_URL)) await h.goto_url(STUDIO_URL);
  await h.wait_for_load?.(12000).catch(()=>{});
  let status='unknown';
  for(let attempt=0;attempt<15;attempt++){
    const page=await h.js(`(()=>({url:location.href,body:(document.body?.innerText||'').slice(0,7000),hasAccount:[...document.querySelectorAll('a[href]')].some(a=>a.href.startsWith('https://www.tiktok.com/@')),hasUpload:[...document.querySelectorAll('button,a')].some(e=>/^(Upload|Upload video)$/i.test((e.textContent||'').trim())),hasUploadForm:(document.body?.innerText||'').includes('Select video to upload')&&[...document.querySelectorAll('button,input')].some(e=>/select video/i.test((e.textContent||'').trim())||e.type==='file')}))()`);
    status=classifyTiktokStudioHeartbeat(page);
    if(status!=='unknown')break;
    if(attempt<14)await sleep(800);
  }
  return {status};
}
