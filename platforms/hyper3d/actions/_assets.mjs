import { ROOT, requireWorkspace, parseDOM } from './_workspace.mjs';

/** Read the browser's currently visible My Assets cards; never call private APIs. */
export default async function assets({ helpers: h, config = {} }) {
  const navigate = config.navigate !== false;
  const current = await requireWorkspace(h);
  // Re-navigating an already open Mine tab resets its lazy-loaded cards.
  // Read the current page first and preserve the user's scroll position.
  if (navigate && !current.url.startsWith(`${ROOT}/tab/mine`)) {
    await h.goto_url(`${ROOT}/tab/mine`);
    try { await h.wait_for_load?.(4000); } catch { /* SPA may remain interactive */ }
  }
  const page = await requireWorkspace(h);
  // On Worknode the four real Mine cards appear only after the owner scrolls.
  // Preserve already-rendered results rather than resetting their SPA route.
  const cardCount = parseDOM(await h.js('document.querySelectorAll("[data-card-id],[data-agentic-task-id]").length'));
  let scroll = null;
  if (config.scroll !== false && !(Number(cardCount) > 0)) {
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
  if (scroll?.attempted && !scroll.moved) {
    // The site occasionally leaves <html> at overflow-y:overlay, which
    // prevents scrollTop and scrollIntoView from moving Chrome. Restrict this
    // fallback to the owned browser tab; it changes no server-side settings.
    const forced = parseDOM(await h.js(`(() => {
      const html=document.documentElement;
      const first=html.scrollTop;
      html.style.overflowY='scroll';
      html.style.scrollBehavior='auto';
      html.scrollTop=Math.max(900,(document.querySelector('.rodin-assets-padding')?.offsetTop||800)+180);
      return {applied:true,moved:html.scrollTop>first+40,top:html.scrollTop};
    })()`));
    scroll = {...scroll,forced,moved:!!forced?.moved};
  }
  if (scroll?.attempted) {
    await h.sleep?.(350);
    // Many user assets live below the ASSET heading; scroll to the bottom as
    // requested, giving IntersectionObserver-backed lazy cards a chance to load.
    const bottom = parseDOM(await h.js(`(() => {
      const html=document.documentElement;
      html.style.overflowY='scroll';
      html.style.scrollBehavior='auto';
      const max=Math.max(0,html.scrollHeight-html.clientHeight);
      html.scrollTop=max;
      return {top:html.scrollTop,max,at_bottom:Math.abs(html.scrollTop-max)<8,
        visible_cards:document.querySelectorAll('[data-card-id],[data-agentic-task-id]').length};
    })()`));
    scroll={...scroll,bottom};
    await h.sleep?.(450);
  }
  const readCards = () => h.js(`(() => {
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
  })()`);
  let value = parseDOM(await readCards());
  // Wait briefly after reaching the asset section/bottom: React may render
  // card nodes in a later frame or after an IntersectionObserver callback.
  for (let i = 0; scroll && !value?.cards?.length && i < 5; i++) {
    await h.sleep?.(500);
    value = parseDOM(await readCards());
  }
  if (!value || !Array.isArray(value.cards)) throw Error('Website asset list unrecognized');
  return { status: value.cards.length ? 'visible' : 'empty_or_unloaded',
    verified_by: 'rendered_site_dom', url:page.url,scroll,...value,
    note: value.cards.length ? null : 'No DOM cards visible; this does not prove the account has no historical assets.' };
}
