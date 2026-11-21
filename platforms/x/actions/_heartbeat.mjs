const HOME = 'https://x.com/home';

export function classifyXHeartbeat(page) {
  let url;
  try { url = new URL(page?.url || ''); } catch { return 'unknown'; }
  if (url.protocol !== 'https:' || !['x.com', 'www.x.com'].includes(url.hostname)) return 'unknown';
  if (/^\/(?:i\/flow\/login|login|signup)(?:\/|$)/i.test(url.pathname)) return 'login_required';
  // A home page or a successful HTTP response alone never proves authentication.
  if (page?.accountSwitcher && page?.profileLink && page?.homeLink) return 'alive';
  if (page?.loginPrompt && !page?.accountSwitcher) return 'login_required';
  return 'unknown';
}

export const X_AUTH_PROBE = `(()=>({
  url:location.href,
  accountSwitcher:!!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]'),
  profileLink:!!document.querySelector('[data-testid="AppTabBar_Profile_Link"]'),
  homeLink:!!document.querySelector('a[href="/home"]'),
  loginPrompt:!!document.querySelector('a[href="/login"],a[href="/i/flow/login"]') ||
    /^(Log in to X|Sign in to X)$/im.test((document.body?.innerText||'').slice(0,1200))
}))()`;

export default async function heartbeat({helpers:h}) {
  const info = await h.page_info();
  if (info.url !== HOME) await h.goto_url(HOME);
  await h.wait_for_load?.(12000).catch(()=>{});
  let status = 'unknown';
  for (let attempt=0; attempt<12; attempt++) {
    const page=await h.js(X_AUTH_PROBE);
    status=classifyXHeartbeat(page);
    if (status!=='unknown') break;
    if (attempt<11) await h.sleep(650);
  }
  return {status};
}
