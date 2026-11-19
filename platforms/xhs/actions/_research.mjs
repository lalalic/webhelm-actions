/** Read-only Xiaohongshu note research. No XHS network/API calls, posting, or reactions.
 * All evidence comes from the signed-in browser's visible profile and detail DOM. */
import { sleep } from '../../_action_helpers.mjs';

const XHS = 'https://www.xiaohongshu.com';
const MAX_CANDIDATES = 60;
const MAX_SAMPLES = 100;
const noteIdPattern = /^[a-f0-9]{24}$/i;

export function parseMetric(raw) {
  if (typeof raw !== 'string') return { raw: null, value: null, approximate: false };
  const text = raw.trim().replace(/[,，\s]/g, '');
  if (!text || /^(赞|收藏|评论|—|-)$/.test(text)) return { raw: raw.trim() || null, value: null, approximate: false };
  const match = text.match(/^(\d+(?:\.\d+)?)(万|千|w|W|k|K)?(\+)?$/);
  if (!match) return { raw: raw.trim(), value: null, approximate: false };
  const multiplier = /^(万|w)$/i.test(match[2] || '') ? 10000 : /^(千|k)$/i.test(match[2] || '') ? 1000 : 1;
  return { raw: raw.trim(), value: Math.round(Number(match[1]) * multiplier), approximate: multiplier !== 1 || !!match[3] };
}

function intOption(raw, name, fallback, max) {
  if (raw === undefined || raw === null) return fallback;
  if (!Number.isInteger(raw) || raw < 1 || raw > max) throw new TypeError(`${name} must be an integer from 1 to ${max}`);
  return raw;
}

function sourceFor(id) { return `${XHS}/explore/${id}`; }
async function navigateReadOnly(h,url) {
  // In this XHS SPA document.readyState often remains 'interactive' while
  // authenticated content has already rendered. WebHelm goto_url waits for
  // 'complete' and can timeout spuriously; navigate via the injected CDP
  // browser helper and poll for the expected actual DOM instead.
  if (typeof h.cdp === 'function') await h.cdp('Page.navigate',{url});
  else await h.goto_url(url);
}
function validXhsUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new TypeError('note_url must be a Xiaohongshu HTTPS note URL'); }
  if (url.protocol !== 'https:' || url.hostname !== 'www.xiaohongshu.com' ||
      !/^\/(?:explore|discovery\/item)\/[a-f0-9]{24}$/i.test(url.pathname))
    throw new TypeError('note_url must be an HTTPS Xiaohongshu note detail URL');
  return url.pathname.match(/([a-f0-9]{24})$/i)[1];
}
const snapshotCardScript = `(() => Array.from(document.querySelectorAll('section.note-item[data-note-id]')).map(e => {
  const id=e.getAttribute('data-note-id')||'';
  return {note_id:id,title:(e.querySelector('a.title')?.textContent||'').trim(),
    author:(e.querySelector('.author .name')?.textContent||'').trim(),
    likes_display:(e.querySelector('.like-wrapper .count')?.textContent||'').trim(),
    collected:true,source_url:'https://www.xiaohongshu.com/explore/'+id};
}).filter(x => /^[a-f0-9]{24}$/i.test(x.note_id)))()`;
const ownProfileScript = `(() => {
  const a=[...document.querySelectorAll('a[href*="/user/profile/"]')]
    .find(e => (e.textContent||'').trim()==='我');
  return a?.href?.split('?')[0]||'';
})()`;
// Only read text nodes of the *currently opened* detail, not list card metrics.
const detailScript = `(() => {
  const mask=document.querySelector('.note-detail-mask');
  const detail=mask?.querySelector('.note-container');
  const bar=mask?.querySelector('.engage-bar-container');
  const video=mask?.querySelector('video');
  const mediaUrl=video?.currentSrc || video?.src || '';
  const mediaHost=(()=>{try{const u=new URL(mediaUrl);return u.protocol==='https:' && u.hostname.endsWith('.xhscdn.com')?u.hostname:null}catch{return null}})();
  const comments=mask?.querySelector('.comments-el');
  const text=e=>(e?.textContent||'').trim();
  const total=text(comments?.querySelector('.total'));
  const countTotal=total.match(/(?:共|总计|全部)\\s*([\\d.,万千kKwW+]+)\\s*条评论/);
  const btn=cls=>text(bar?.querySelector(cls+' .count'));
  const commentItems=[...(comments?.querySelectorAll('.comment-item')||[])];
  const list=commentItems.map((c,i)=>({
    dom_index:i,comment_id:(c.id||'').replace(/^comment-/,''),
    text:text(c.querySelector('.content .note-text')),
    time:text(c.querySelector('.date > span:first-child')),
    is_reply:c.classList.contains('comment-item-sub'),
    reply_label:text(c.querySelector('.reply .count'))
  })).filter(c=>c.text);
  return {found:!!detail,ready:!!countTotal && !!text(bar?.querySelector('.collect-wrapper .count')) && !!text(bar?.querySelector('.chat-wrapper .count')),
    heading: text(detail?.querySelector('.title,.note-content .title')),
    body:text(detail?.querySelector('.desc,.note-content .desc')).slice(0,4500),
    likes_display:btn('.like-wrapper'),saves_display:btn('.collect-wrapper'),
    comments_display:countTotal?.[1]||null,comments_header:total||null,
    comment_button_display:btn('.chat-wrapper'),
    sample:list,visible_comment_count:list.length,
    loading:!!(comments?.innerText||'').includes('加载中'),
    media:{type:video?'video':(mask?.querySelector('.swiper-slide img,.note-image-box img')?'images':'unknown'),
      video_source_available:!!mediaHost,video_source_host:mediaHost,
      video_source_url:mediaHost?mediaUrl:null,
      duration_seconds:Number.isFinite(video?.duration)&&video.duration>0?Math.round(video.duration*100)/100:null,
      embedded_caption_tracks:video?.querySelectorAll('track').length||0},
    auth_blocked:/登录后|登录查看|扫码登录|请先登录/.test(detail?.innerText||'')};
})()`;

function normalizeDetail(data, candidate, observedAt, limit, includeMediaUrl=false) {
  const likes = parseMetric(data.likes_display || candidate.likes_display || '');
  const saves = parseMetric(data.saves_display || '');
  // Trust the explicitly labelled comment total. The chat count is supplemental
  // evidence only and never replaces a missing comment total for qualification.
  const comments = parseMetric(data.comments_display || '');
  const raw = Array.isArray(data.sample) ? data.sample : [];
  const seen = new Set();
  const sample = raw.filter(x => {
    const key = x.comment_id || `${x.dom_index}:${x.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0,limit).map(({dom_index,comment_id,text,time,is_reply,reply_label})=>({dom_index,comment_id,text,time,is_reply,reply_label}));
  return {
    note_id:candidate.note_id, url:sourceFor(candidate.note_id),
    title:data.heading||candidate.title,author:candidate.author,
    collected: candidate.collected,
    text:data.body || null,
    media:data.media?{type:data.media.type,video_source_available:data.media.video_source_available,
      video_source_host:data.media.video_source_host,duration_seconds:data.media.duration_seconds,
      embedded_caption_tracks:data.media.embedded_caption_tracks,
      ...(includeMediaUrl&&data.media.video_source_available?{video_source_url:data.media.video_source_url}:{}),
      stt:{status:data.media.type==='video'?'not_transcribed':'not_applicable',
        next_step:data.media.type==='video'?'transfer_authorized_video_to_worknode_and_run_stt':null}}:null,
    metrics:{likes,saves,comments},
    comments_header:data.comments_header || null,
    comment_button_display:data.comment_button_display || null,
    comments_sample:sample,
    sampled_count:sample.length,
    sampled_coverage:'visible_loaded_dom_only',
    observed_at:observedAt,
    evidence:{collection_card:true,detail_loaded:!!data.ready,comment_total_from:'detail .comments-el .total'}
  };
}
async function currentProfile(h) {
  // XHS keeps network requests alive; waiting for full load can timeout even
  // when the signed-in DOM has already hydrated. Check the existing tab first.
  let profile=await h.js(ownProfileScript);
  if (!profile) await navigateReadOnly(h,`${XHS}/explore`);
  for (let i=0;i<12;i++) {
    try { profile=await h.js(ownProfileScript); } catch { profile=''; }
    if (profile && new URL(profile).hostname==='www.xiaohongshu.com' &&
        /^\/user\/profile\/[a-z0-9]+$/i.test(new URL(profile).pathname)) break;
    await sleep(400);
  }
  return profile;
}
async function collectCards(h,profile,limit,requestedId=null) {
  await navigateReadOnly(h,`${profile}?tab=fav&subTab=note`);
  let cards=[];
  for (let i=0;i<16;i++) {
    try { cards=await h.js(snapshotCardScript); } catch { cards=[]; }
    if (cards.length) break;
    await sleep(400);
  }
  // Hydration is incremental: the XHS profile often has 10 cards initially
  // and 30 only a few seconds later. A 'not found' from the first batch is
  // not evidence that the saved post is absent.
  if(requestedId && !cards.some(x=>x.note_id===requestedId)) {
    for(let i=0;i<12;i++) {
      await sleep(500);
      try { cards=await h.js(snapshotCardScript); } catch { cards=[]; }
      if(cards.some(x=>x.note_id===requestedId)) break;
    }
  }
  // XHS loads more collection cards on scroll; never silently claim exhaustive coverage.
  for (let i=0;i<10 && cards.length<limit;i++) {
    const count=cards.length;
    await h.js('window.scrollTo(0,document.body.scrollHeight)');
    await sleep(400);
    try { cards=await h.js(snapshotCardScript); } catch { cards=[]; }
    if(cards.length===count && i>=3) break;
  }
  return cards.slice(0,limit);
}
async function openFromCollection(h,profile,card) {
  await navigateReadOnly(h,`${profile}?tab=fav&subTab=note`);
  let clicked=false;
  for(let i=0;i<12;i++) {
    try { clicked=await h.js(`(() => {
      const e=Array.from(document.querySelectorAll('section.note-item'))
        .find(c=>c.getAttribute('data-note-id')===${JSON.stringify(card.note_id)});
      const a=e?.querySelector('a.cover,a.title');
      if(!a)return false;
      a.click();return true;
    })()`); } catch { clicked=false; }
    if(clicked)break;
    await sleep(350);
  }
  return clicked;
}
async function extractDetail(h,card,sampleLimit,maxWaitMs,includeMediaUrl=false) {
  let d=null;
  const attempts=Math.ceil(maxWaitMs/500);
  for(let i=0;i<attempts;i++) {
    try { d=await h.js(detailScript); } catch { d=null; }
    const current=(await h.page_info()).url;
    if (/\/404(?:\?|$)|\/login(?:\?|$)/i.test(current))
      return {status:'blocked',reason:'post_detail_unavailable',note_id:card.note_id,url:sourceFor(card.note_id)};
    if(d?.auth_blocked)
      return {status:'blocked',reason:'login_required',note_id:card.note_id,url:sourceFor(card.note_id)};
    if(d?.ready) break;
    await sleep(500);
  }
  // Expand visible comment threads to improve coverage, without API calls or
  // any action that changes a post's comments, likes, saves, or publication.
  if(d?.ready && sampleLimit > (d.sample?.length||0)) {
    for(let i=0;i<5;i++) {
      let opened=0;
      try { opened=await h.js(`(() => {
        const root=document.querySelector('.note-detail-mask .comments-el');
        if(!root)return 0;
        const options=[...root.querySelectorAll('*')].filter(e =>
          e.children.length===0 && /^(展开\s*\d+\s*条回复|展开更多回复|展开更多)$/.test((e.textContent||'').trim()));
        options.slice(0,3).forEach(e=>e.click());
        return options.length;
      })()`); } catch { break; }
      if(!opened) break;
      await sleep(500);
      try { d=await h.js(detailScript); } catch { break; }
      if((d.sample?.length||0)>=sampleLimit) break;
    }
  }
  if(!d?.ready) return {status:'blocked',reason:'comment_detail_not_loaded',note_id:card.note_id,
    url:sourceFor(card.note_id),likes_from_collection:parseMetric(card.likes_display),
    comments_verified:false,details_accessible:!!d?.found};
  const post=normalizeDetail(d,card,new Date().toISOString(),sampleLimit,includeMediaUrl);
  return {status:'complete',post};
}

/**
 * config: {operation:'collections'|'post', scan_limit:1..60,
 *          min_comments_exclusive:integer>=0, comment_limit:1..100,
 *          detail_wait_ms:1000..30000, note_id?:ID, note_url?:XHS URL}
 * Returns read-only, evidence-labelled metrics. Qualification requires a
 * visible, labelled comment count. Never infer from likes or a loaded sample.
 */
export default async function research({config:c={},helpers:h,log=()=>{}}) {
  const operation=c.operation||'collections';
  if(!['collections','post'].includes(operation)) throw new TypeError('operation must be collections or post');
  const limit=intOption(c.scan_limit,'scan_limit',20,MAX_CANDIDATES);
  const sampleLimit=intOption(c.comment_limit,'comment_limit',50,MAX_SAMPLES);
  const waitMs=intOption(c.detail_wait_ms,'detail_wait_ms',10000,30000);
  if(waitMs<1000)throw new TypeError('detail_wait_ms must be at least 1000');
  const threshold=c.min_comments_exclusive??1000;
  if(!Number.isInteger(threshold)||threshold<0)throw new TypeError('min_comments_exclusive must be a nonnegative integer');
  if(c.include_media_url!==undefined && typeof c.include_media_url!=='boolean')throw new TypeError('include_media_url must be boolean');
  const requestedId=c.note_url?validXhsUrl(c.note_url):c.note_id||null;
  if(requestedId&&!noteIdPattern.test(requestedId))throw new TypeError('invalid note_id');
  if(operation==='post'&&!requestedId)throw new TypeError('post mode requires note_id or note_url');
  const profile=await currentProfile(h);
  if(!profile) return {ok:false,status:'blocked',operation,reason:'login_or_own_profile_unavailable'};
  const list=await collectCards(h,profile,Math.max(limit,operation==='post'?60:limit),requestedId);
  if(!list.length) return {ok:false,status:'blocked',operation,reason:'collections_unavailable_or_empty',
    collection_url:`${profile}?tab=fav&subTab=note`,observed_at:new Date().toISOString()};
  const cards=operation==='post' ? list.filter(x=>x.note_id===requestedId) : list.slice(0,limit);
  if(!cards.length) return {ok:false,status:'not_found',operation,reason:'post_not_found_in_loaded_collections',
    observed_cards:list.length,collection_url:`${profile}?tab=fav&subTab=note`};
  const inspected=[],blockers=[];
  let selected=null;
  for(const card of cards) {
    const clicked=await openFromCollection(h,profile,card);
    if(!clicked){blockers.push({note_id:card.note_id,reason:'collection_card_not_available_for_click'});continue;}
    const result=await extractDetail(h,card,sampleLimit,waitMs,c.include_media_url===true);
    if(result.status==='complete') {
      const post=result.post;
      const count=post.metrics.comments.value;
      // The raw total must be present; approximation is allowed only when the
      // displayed count itself confidently exceeds the chosen threshold.
      post.qualifies_comment_threshold=count!==null&&count>threshold;
      inspected.push(post);
      if(operation==='post'||post.qualifies_comment_threshold){selected=post;break;}
    } else blockers.push({note_id:card.note_id,reason:result.reason});
  }
  const output={ok:!!selected,status:selected?'complete':blockers.length?'partial':'no_qualifying_post',operation,
    minimum_comments_exclusive:threshold,selected,
    inspected:inspected.map(p=>({note_id:p.note_id,url:p.url,title:p.title,metrics:p.metrics,
      qualifies_comment_threshold:p.qualifies_comment_threshold,observed_at:p.observed_at})),
    blockers,observed_collection_cards:list.length,attempted_detail_count:inspected.length+blockers.length,
    collection_url:`${profile}?tab=fav&subTab=note`,observed_at:new Date().toISOString(),
    coverage:'collection_cards_first_to_last_visible; not all saved posts',
    source:'signed_in_xhs_browser_visible_dom',publication_allowed:false};
  log(JSON.stringify({action:'xhs.research',operation,status:output.status,
    attempted:output.attempted_detail_count,selected_id:selected?.note_id||null}));
  return output;
}
