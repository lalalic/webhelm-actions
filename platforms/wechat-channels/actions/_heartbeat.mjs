import {sleep} from '../../_action_helpers.mjs';

const HEARTBEAT_URL = 'https://channels.weixin.qq.com/platform/post/list';

export function classifyChannelsHeartbeat(page) {
  let url;
  try {url = new URL(page?.url || '');} catch {return 'unknown';}
  if (url.hostname !== 'channels.weixin.qq.com' || url.protocol !== 'https:') return 'unknown';
  if (/(^|\/)(login|signin|auth)(\/|$)/i.test(url.pathname)) return 'login_required';
  const text = String(page?.body || '') + ' ' + String(page?.embeddedText || '');
  if (/微信扫码登录|请使用微信扫码|扫码登录视频号|请扫码登录|扫码后.*手机.*确认|请先登录/.test(text))
    return 'login_required';
  // The authenticated creator manager runs inside wujie-app's shadow root.
  // Merely rendering the '视频号助手' title or a shell does not prove login.
  if (url.pathname.startsWith('/platform/post/list') && page?.hasManager &&
      (/视频管理|动态管理|作品管理|内容管理|发表记录|发布视频|上传视频|素材管理|已发表|已发布/.test(text) ||
        Number(page?.managerRows)>0)) return 'alive';
  return 'unknown';
}

export default async function heartbeat({helpers:h}) {
  if ((await h.page_info()).url !== HEARTBEAT_URL) await h.goto_url(HEARTBEAT_URL);
  await h.wait_for_load(12000).catch(()=>{});
  let status='unknown';
  for(let i=0;i<12;i++) {
    const page=await h.js(`(()=>{const app=document.querySelector('wujie-app'),body=app?.shadowRoot?.querySelector('body');return {url:location.href,body:(document.body?.innerText||'').slice(0,4500),embeddedText:(body?.innerText||body?.textContent||'').slice(0,6500),hasManager:!!body,managerRows:body?.querySelectorAll('tbody tr,[class*="post-item"],[class*="video-item"]')?.length||0}})()`);
    status=classifyChannelsHeartbeat(page);
    if(status!=='unknown') break;
    if(i<11) await sleep(800);
  }
  return {status};
}
