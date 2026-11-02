const POSTS = "https://www.tiktok.com/tiktokstudio/content";
const COMMENTS = "https://www.tiktok.com/tiktokstudio/comment";
export default async function monitor({ helpers: h, config: c = {} }) {
  const mode = c.mode || "posts";
  if (!["posts", "comments"].includes(mode)) throw new Error("Unsupported monitor mode");
  await h.goto_url(mode === "posts" ? POSTS : COMMENTS);
  await h.wait_for_load?.();
  const page = await h.page_info();
  if (/login|accounts/i.test(page.url))
    return { status: "blocked", reason: "login_required", posts: [], comments: [] };
  if (!page.url.startsWith("https://www.tiktok.com/tiktokstudio"))
    return { status: "blocked", reason: "unexpected_url", posts: [], comments: [] };
  if (mode === "comments") {
    const data = await h.js(`(() => [...document.querySelectorAll('[data-e2e="comment-item"],[class*="comment-item"]')]
      .slice(0,30).map(el => ({ text: (el.innerText || '').trim().slice(0,2000) }))
      .filter(x=>x.text))()`);
    if (!data?.length) {
      await h.wait?.(2);
      const after = await h.page_info();
      if (/login|accounts/i.test(after.url)) return {status:"blocked",reason:"login_required",posts:[],comments:[]};
    }
    return { status: data?.length ? "ok" : "unverified", observed_at: new Date().toISOString(), source_url: page.url, comments: data || [], reason: data?.length ? null : "comment_rows_not_found" };
  }
  const rows = await h.js(`(() => {
    const seen = new Set();
    return [...document.querySelectorAll('a[href*="/video/"]')].flatMap(a => {
      const url = a.href;
      if (!url.startsWith('https://www.tiktok.com/@') || !url.includes('/video/') || seen.has(url)) return [];
      seen.add(url);
      const row = a.closest('tr,[role="row"],[class*="video-item"],[class*="post-item"]') || a.parentElement;
      return [{ url, summary: (row?.innerText || '').trim().slice(0,650), metrics: { views: row?.querySelector('[data-e2e=video-views]')?.textContent?.trim() || null, likes: row?.querySelector('[data-e2e=video-likes]')?.textContent?.trim() || null, comments: row?.querySelector('[data-e2e=video-comments]')?.textContent?.trim() || null } }];
    }).slice(0,30);
  })()`);
  if (!rows?.length) {
    await h.wait?.(2);
    const after = await h.page_info();
    if (/login|accounts/i.test(after.url)) return {status:"blocked",reason:"login_required",posts:[],comments:[]};
  }
  return { status: rows?.length ? "ok" : "unverified", observed_at: new Date().toISOString(), source_url: page.url, posts: rows || [], reason: rows?.length ? null : "post_rows_not_found" };
}
