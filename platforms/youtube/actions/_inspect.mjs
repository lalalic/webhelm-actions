const URL = "https://studio.youtube.com/";
export default async function inspect({ helpers: h, config: c = {} }) {
  await h.goto_url(URL);
  await h.wait_for_load?.();
  const page = await h.page_info();
  if (/accounts\.google\.com|\/signin/i.test(page.url))
    return { status: "blocked", reason: "login_required", upload_ready: false };
  if (page.url.startsWith("chrome-error:"))
    return { status: "blocked", reason: "browser_navigation_error", upload_ready: false };
  if (!page.url.startsWith("https://studio.youtube.com/channel/"))
    return { status: "blocked", reason: "channel_unverified", upload_ready: false };
  const channelId = page.url.match(/\/channel\/([^/?#]+)/)?.[1] || null;
  const data = await h.js(`(() => {
    const upload = [...document.querySelectorAll('button,ytcp-button')]
      .some(e => /^(Create|Upload videos)$/i.test((e.textContent || '').trim()));
    return { upload };
  })()`);
  if (c.expected_channel_id && c.expected_channel_id !== channelId)
    return { status: "blocked", reason: "account_mismatch", channel_id: channelId, upload_ready: false };
  if (!channelId || !data?.upload)
    return { status: "blocked", reason: "upload_control_missing", channel_id: channelId, upload_ready: false };
  return { status: "ready", channel_id: channelId, channel_url: `https://www.youtube.com/channel/${channelId}`, upload_ready: true, published_tested: false };
}
