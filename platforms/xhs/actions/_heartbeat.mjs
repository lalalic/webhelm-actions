import {sleep} from '../../_action_helpers.mjs';

const HEARTBEAT_URL = 'https://creator.xiaohongshu.com/new/note-manager';

export function classifyXhsHeartbeat(page) {
  let url;
  try {url = new URL(page?.url || '');} catch {return 'unknown';}
  if (url.hostname !== 'creator.xiaohongshu.com' || url.protocol !== 'https:') return 'unknown';
  if (/(^|\/)(login|signin|passport|auth)(\/|$)/i.test(url.pathname)) return 'login_required';
  const text = String(page?.body || '');
  if (/扫码登录|手机验证码登录|短信验证码登录|手机号登录|登录后.*创作|请先登录/.test(text))
    return 'login_required';
  if (Number(page?.noteCards) > 0) return 'alive';
  // An empty creator dashboard is still authenticated, but a page title or
  // successful navigation alone is not proof of a valid session.
  if (url.pathname.startsWith('/new/note-manager') &&
      /笔记管理|作品管理|发布笔记|暂无笔记|作品数据/.test(text)) return 'alive';
  return 'unknown';
}

// No writes, logins, or credential access. Visiting the creator manager is
// the only heartbeat; classify solely from the visible site-specific UI.
export default async function heartbeat({helpers:h}) {
  if ((await h.page_info()).url !== HEARTBEAT_URL) await h.goto_url(HEARTBEAT_URL);
  await h.wait_for_load(12000).catch(()=>{});
  let status='unknown';
  for(let i=0;i<12;i++) {
    const page=await h.js(`(()=>({url:location.href,body:(document.body?.innerText||'').slice(0,6000),noteCards:document.querySelectorAll('.note-card').length}))()`);
    status=classifyXhsHeartbeat(page);
    if(status!=='unknown') break;
    if(i<11) await sleep(800);
  }
  return {status};
}
