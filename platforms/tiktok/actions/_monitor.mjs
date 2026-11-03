import inspect from "./_inspect.mjs";

const POSTS = "https://www.tiktok.com/tiktokstudio/content";
const COMMENTS = "https://www.tiktok.com/tiktokstudio/comment";

export default async function monitor({ helpers: h, config: c = {} }) {
  const mode = c.mode || "posts";
  if (!["posts", "comments"].includes(mode)) throw new Error("Unsupported monitor mode");
  if (c.expected_handle) {
    const account = await inspect({ helpers: h, config: { expected_handle: c.expected_handle } });
    if (account.status !== "ready")
      return { status: "blocked", reason: account.reason || "account_unverified", posts: [], comments: [] };
  }
  await h.goto_url(mode === "posts" ? POSTS : COMMENTS);
  await h.wait_for_load?.();
  const readState = async () => {
    const page = await h.page_info();
    if (/login|accounts/i.test(page.url))
      return { status: "blocked", reason: "login_required", posts: [], comments: [] };
    if (!page.url.startsWith("https://www.tiktok.com/tiktokstudio"))
      return { status: "blocked", reason: "unexpected_url", posts: [], comments: [] };
    return { page };
  };

  for (let attempt = 0; attempt < 7; attempt++) {
    const current = await readState();
    if (current.status === "blocked") return current;
    const page = current.page;
    if (mode === "comments") {
      const data = await h.js(`(() => {
        const elements = document.querySelectorAll('[data-e2e="comment-item"],[class*="comment-item"]');
        return {
          comments: [...elements].slice(0,30).map(el => ({
            text:(el.innerText||'').trim().slice(0,2000)
          })).filter(x => x.text),
          empty: document.body.innerText.includes('No comments yet')
        };
      })()`);
      if (data?.comments?.length || data?.empty) {
        return {
          status: "ok", observed_at: new Date().toISOString(),
          source_url: page.url, comments: data.comments,
          empty_state_verified: !!data.empty
        };
      }
    } else {
      const data = await h.js(`(() => {
        const seen = new Set();
        const posts = [...document.querySelectorAll('a[href*="/video/"]')].flatMap(a => {
          const url = a.href;
          if (!url.startsWith('https://www.tiktok.com/@') || !url.includes('/video/') || seen.has(url)) return [];
          seen.add(url);
          const row = a.closest('[data-tt="components_RowLayout_FlexRow"]') ||
            a.closest('tr,[role="row"]') || a.parentElement;
          const metric = n => row?.querySelector('[data-tt="components_RowLayout_FlexRow_' + n + '"]')
            ?.textContent?.trim() || null;
          return [{
            url, summary:(row?.innerText || a.innerText || '').trim().slice(0,750),
            metrics:{views:metric(6),likes:metric(7),comments:metric(8)}
          }];
        }).slice(0,30);
        return { posts, empty: document.body.innerText.includes('No posts yet') ||
          document.body.innerText.includes('No posts to display') };
      })()`);
      if (data?.posts?.length || data?.empty) {
        return {
          status: "ok", observed_at: new Date().toISOString(),
          source_url: page.url, posts: data.posts,
          empty_state_verified: !!data.empty,
          // Only a future authenticated, all-state draft inspector may fill
          // this. Today's post-list DOM has no draft coverage evidence.
          draft_inventory: data.draft_inventory || null
        };
      }
    }
    if (attempt < 6) await h.wait?.(2);
  }
  const page = await h.page_info();
  return {
    status: "unverified", reason: mode === "comments" ? "comment_rows_not_found" : "post_rows_not_found",
    observed_at: new Date().toISOString(), source_url: page.url,
    ...(mode === "comments" ? {comments: []} : {posts: []})
  };
}
