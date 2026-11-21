import {classifyXHeartbeat, X_AUTH_PROBE} from './_heartbeat.mjs';

const EXTRACT_TWEETS = `(()=>[...document.querySelectorAll('article[data-testid="tweet"]')].map(a=>{
  const status = a.querySelector('time')?.closest('a[href*="/status/"]') ||
    [...a.querySelectorAll('a[href*="/status/"]')].find(x=>/^\\/[A-Za-z0-9_]{1,15}\\/status\\/\\d+$/.test(new URL(x.href).pathname));
  if(!status)return null;
  const path=new URL(status.href).pathname;
  const match=path.match(/^\\/([A-Za-z0-9_]{1,15})\\/status\\/(\\d+)$/);
  if(!match)return null;
  const metric=t=>a.querySelector('[data-testid="'+t+'"]')?.getAttribute('aria-label')||'';
  return {id:match[2],author_handle:match[1],created_at:a.querySelector('time')?.getAttribute('datetime')||'',
    text:a.querySelector('[data-testid="tweetText"]')?.innerText||'',
    replies:metric('reply'),reposts:metric('retweet'),likes:metric('like')};
}).filter(Boolean))()`;

export function metricCount(label) {
  // X renders localized counts, and some labels contain "Reply" but no count.
  const match=String(label||'').replace(/\u202f/g,' ').match(/(?:^|\s)(\d[\d.,]*)(?:\s*([kmb]))?(?=\s|$)/i);
  if (!match) return 0;
  const numeric=match[2]?Number(match[1].replace(/,/g,'')):
    Number(match[1].replace(/[,.]/g,''));
  if(!Number.isFinite(numeric))return 0;
  return Math.max(0,Math.round(numeric*({k:1000,m:1e6,b:1e9}[match[2]?.toLowerCase()]||1)));
}

export function normalizeTweet(raw) {
  if(!/^\d{15,22}$/.test(String(raw?.id||'')))return null;
  if(!/^[A-Za-z0-9_]{1,15}$/.test(String(raw?.author_handle||'')))return null;
  const date=new Date(raw.created_at);
  if(!Number.isFinite(date.getTime())||!String(raw.text||'').trim())return null;
  return {id:raw.id,author_handle:raw.author_handle,created_at:date.toISOString(),
    text:raw.text.slice(0,9000),likes:metricCount(raw.likes),reposts:metricCount(raw.reposts),
    replies:metricCount(raw.replies),quotes:0};
}

export function searchUrl({query,mode='latest',since,until}={}) {
  if(typeof query!=='string'||!query.trim()||query.length>400)throw Error('query must be 1-400 characters');
  if(!['latest','top'].includes(mode))throw Error('mode must be latest or top');
  for(const [key,value] of Object.entries({since,until})) {
    if(value!=null && !/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error(`${key} must be YYYY-MM-DD`);
  }
  const q=[query.trim(),since?`since:${since}`:'',until?`until:${until}`:''].filter(Boolean).join(' ');
  return `https://x.com/search?q=${encodeURIComponent(q)}&f=${mode==='latest'?'live':'top'}`;
}

export default async function search({helpers:h,config={}}) {
  const maxPosts=Math.min(100,Math.max(1,Number(config.max_posts??40)));
  const scrolls=Math.min(25,Math.max(0,Number(config.scrolls??12)));
  if(!Number.isInteger(maxPosts)||!Number.isInteger(scrolls))throw Error('max_posts and scrolls must be integers');
  const url=searchUrl(config);
  await h.goto_url(url);
  await h.wait_for_load?.(15000).catch(()=>{});
  const seen=new Map();
  let state='unknown',noNew=0;
  for(let step=0;step<=scrolls;step++){
    const auth=classifyXHeartbeat(await h.js(X_AUTH_PROBE));
    if(auth==='login_required')return {status:'login_required',posts:[],count:0};
    if(auth==='alive')state='alive';
    const rows=await h.js(EXTRACT_TWEETS);
    const before=seen.size;
    for(const row of rows||[]){
      const post=normalizeTweet(row);
      if(!post)continue;
      const time=post.created_at.slice(0,10);
      if(config.since&&time<config.since)continue;
      if(config.until&&time>=config.until)continue;
      if(!seen.has(post.id))seen.set(post.id,post);
    }
    if(seen.size>=maxPosts)break;
    noNew=seen.size===before?noNew+1:0;
    if(noNew>=4)break;
    if(step<scrolls){
      await h.js('window.scrollBy(0,Math.max(550,window.innerHeight*1.4))');
      await h.sleep(900);
    }
  }
  return {status:state,source:'x.com/authenticated-webhelm-browser',query:config.query,
    mode:config.mode||'latest',count:Math.min(seen.size,maxPosts),
    // X search cards do not show per-post quote counts. These zeros are placeholders, not verified.
    quotes_verified:false,posts:[...seen.values()].slice(0,maxPosts)};
}
