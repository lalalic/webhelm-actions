import { ROOT, requireWorkspace, parseDOM } from './_workspace.mjs';

/** Read the browser's currently visible My Assets cards; never call private APIs. */
export default async function assets({ helpers: h, config = {} }) {
  const navigate = config.navigate !== false;
  if (navigate) {
    await h.goto_url(`${ROOT}/tab/mine`);
    await h.wait_for_load?.();
  }
  const page = await requireWorkspace(h);
  // Mine thumbnails are commonly virtualized / loaded after scrolling.
  // A navigation followed by DOM inspection alone is insufficient.
  let scroll = null;
  if (config.scroll !== false) {
    scroll = parseDOM(await h.js(`(() => {
      const a=document.querySelector('.rodin-assets-padding');
      const first={scrollTop:document.scrollingElement?.scrollTop || 0,
        assetTop:a?.getBoundingClientRect().top || null,
        count:document.querySelectorAll('[data-card-id],[data-agentic-task-id]').length};
      a?.scrollIntoView({behavior:'instant',block:'start'});
      window.scrollBy(0,Math.max(window.innerHeight,600));
      const second={scrollTop:document.scrollingElement?.scrollTop || 0,
        assetTop:a?.getBoundingClientRect().top || null,
        count:document.querySelectorAll('[data-card-id],[data-agentic-task-id]').length};
      return {attempted:true,moved:second.scrollTop>first.scrollTop ||
        (second.assetTop!==null && first.assetTop!==null && second.assetTop<first.assetTop-50),
        before:first,after:second};
    })()`));
  }
  const value = parseDOM(await h.js(`(() => {
    const nodes = [...document.querySelectorAll('article[data-agentic-task-id], [data-card-id]')];
    const seen = new Set();
    const cards = [];
    for (const e of nodes) {
      const id = e.getAttribute('data-agentic-task-id') || e.getAttribute('data-card-id');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      cards.push({id, state:e.getAttribute('aria-label') || null,
        step:e.getAttribute('data-card-step') || null,
        busy:e.getAttribute('aria-busy') === 'true',
        type:e.getAttribute('data-card-type') || null});
    }
    const state = document.readyState;
    const ended = document.body.innerText.includes('\\nEND\\n');
    return {cards:cards.slice(0,60),visible_count:cards.length,listing_ended:ended,
      page_state:state, view_result:!!document.querySelector('button[aria-label="View result"]')};
  })()`));
  if (!value || !Array.isArray(value.cards)) throw Error('Website asset list unrecognized');
  return { status: value.cards.length ? 'visible' : 'empty_or_unloaded',
    verified_by: 'rendered_site_dom', url:page.url,scroll,...value,
    note: value.cards.length ? null : 'No DOM cards visible; this does not prove the account has no historical assets.' };
}
