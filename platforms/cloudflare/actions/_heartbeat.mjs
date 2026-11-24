const HOME = 'https://dash.cloudflare.com/';

export function classifyCloudflareHeartbeat(page) {
  let url;
  try { url = new URL(page?.url || ''); } catch { return 'unknown'; }
  if (url.protocol !== 'https:' || url.hostname !== 'dash.cloudflare.com') return 'unknown';
  if (/^\/(?:login|sign-up|signup)(?:\/|$)/i.test(url.pathname)) return 'login_required';
  if (page?.loginForm && page?.signInHeading) return 'login_required';
  // Account controls plus the authenticated account-home view prove login;
  // neither a 200 response nor loading the Dashboard shell is sufficient.
  if (page?.switchAccount && page?.userMenu && page?.accountHome) return 'alive';
  return 'unknown';
}

export const CLOUDFLARE_AUTH_PROBE = `(() => ({
  url:location.href,
  switchAccount:!!document.querySelector('button[aria-label="Switch Account"]'),
  userMenu:!!document.querySelector('button[aria-label="User menu"]'),
  accountHome:/Account home/i.test(document.title) &&
    /^\\/[^/]+\\/home\\/?$/.test(location.pathname),
  loginForm:!!document.querySelector('input[type="password"]'),
  signInHeading:/Sign in to Cloudflare/i.test(document.body?.innerText||'')
}))()`;

export default async function heartbeat({helpers:h}) {
  await h.goto_url(HOME);
  await h.wait_for_load?.(12000).catch(()=>{});
  let status='unknown';
  for (let attempt=0; attempt<12; attempt++) {
    status=classifyCloudflareHeartbeat(await h.js(CLOUDFLARE_AUTH_PROBE));
    if (status!=='unknown') break;
    if (attempt<11) await h.sleep(650);
  }
  return {status};
}
