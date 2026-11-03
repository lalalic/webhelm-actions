const STUDIO = "https://studio.youtube.com/";
export default async function monitor({ helpers: h, config: c = {} }) {
  const mode = c.mode || "posts";
  if (!["posts", "comments"].includes(mode)) throw new Error("Unsupported monitor mode");
  const contentType = c.content_type || "shorts";
  if (!["shorts", "videos"].includes(contentType)) throw new Error("Unsupported content_type");
  await h.goto_url(STUDIO);
  await h.wait_for_load?.();
  const initial = await h.page_info();
  if (/accounts\.google\.com|\/signin/i.test(initial.url))
    return { status: "blocked", reason: "login_required", posts: [], comments: [] };
  if (initial.url.startsWith("chrome-error:"))
    return { status: "blocked", reason: "browser_navigation_error", posts: [], comments: [] };
  const channel = initial.url.match(/^https:\/\/studio\.youtube\.com\/channel\/([^/?#]+)/)?.[1];
  if (!channel) return { status: "blocked", reason: "channel_unverified", posts: [], comments: [] };
  if (c.expected_channel_id && c.expected_channel_id !== channel)
    return { status: "blocked", reason: "account_mismatch", posts: [], comments: [] };
  await h.goto_url(`https://studio.youtube.com/channel/${channel}/${mode === "posts" ? (contentType === "shorts" ? "videos/short" : "videos/upload") : "comments/inbox"}`);
  await h.wait_for_load?.();
  const page = await h.page_info();
  if (!page.url.startsWith(`https://studio.youtube.com/channel/${channel}/`))
    return { status: "blocked", reason: "unexpected_url", posts: [], comments: [] };
  if (mode === "comments") {
    const rows = await h.js(`(() => [...document.querySelectorAll('ytcp-comment-thread,[role="row"],ytcp-comment-row')]
      .slice(0,30).map(x=>({ text:(x.innerText||'').trim().slice(0,2000) }))
      .filter(x=>x.text))()`);
    return { status: rows?.length ? "ok" : "unverified", channel_id: channel, content_type: contentType, observed_at: new Date().toISOString(), source_url: page.url, comments: rows || [], reason: rows?.length ? null : "comment_rows_not_found" };
  }
  const rows = await h.js(`(() => [...document.querySelectorAll('ytcp-video-row,[role="row"]')]
      .slice(0,30).map(x=>{
        const a = x.querySelector('a[href*="watch?v="],a[href*="/shorts/"],a[href*="/video/"]');
        const id = x.getAttribute('video-id') || a?.href.split('/video/')[1]?.split('/')[0] || null;
        return { title:(x.querySelector('#video-title')?.textContent||a?.textContent||'').trim().slice(0,180), url:id ? 'https://www.youtube.com/shorts/' + id : a?.href||null, post_id:id, summary:(x.innerText||'').trim().slice(0,900), metrics: {views:x.querySelector('#video-views,#views-count')?.textContent?.trim() || null, comments:x.querySelector('#video-comments,#comments-count')?.textContent?.trim() || null, likes:null} };
      }).filter(x=>x.title||x.url))()`);
  return { status: rows?.length ? "ok" : "unverified", channel_id: channel, content_type: contentType, observed_at: new Date().toISOString(), source_url: page.url, posts: rows || [], reason: rows?.length ? null : "post_rows_not_found", draft_inventory: null /* all-state draft inspection not implemented */ };
}
