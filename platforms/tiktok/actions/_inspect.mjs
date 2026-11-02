const URL = "https://www.tiktok.com/tiktokstudio";

export default async function inspect({ helpers: h, config: c = {} }) {
  await h.goto_url(URL);
  await h.wait_for_load?.();
  const page = await h.page_info();
  if (/login|accounts/i.test(page.url))
    return { status: "blocked", reason: "login_required", upload_ready: false };
  if (!page.url.startsWith(URL))
    return { status: "blocked", reason: "unexpected_url", upload_ready: false };

  const read = () => h.js(`(() => {
    const a = [...document.querySelectorAll('a[href]')]
      .find(e => e.href.startsWith('https://www.tiktok.com/@'));
    const handle = a?.href.split('/@')[1]?.split('/')[0]?.split('?')[0] || null;
    const upload = [...document.querySelectorAll('button,a')]
      .some(e => /^(Upload|Upload video)$/i.test((e.textContent || '').trim()));
    return { handle, upload };
  })()`);
  let data = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    data = await read();
    if (data?.handle && data?.upload) break;
    const next = await h.page_info();
    if (/login|accounts/i.test(next.url))
      return { status: "blocked", reason: "login_required", upload_ready: false };
    if (attempt < 7) await h.wait?.(2);
  }
  const expected = c.expected_handle?.replace(/^@/, "") || null;
  const actual = data?.handle?.replace(/^@/, "") || null;
  if (expected && actual !== expected)
    return { status: "blocked", reason: actual ? "account_mismatch" : "account_unverified", actual_handle: actual, upload_ready: false };
  if (!actual || !data?.upload)
    return { status: "blocked", reason: !actual ? "account_unverified" : "upload_control_missing", actual_handle: actual, upload_ready: false };
  return { status: "ready", account_handle: actual, account_url: `https://www.tiktok.com/@${actual}`, upload_ready: true, published_tested: false };
}
