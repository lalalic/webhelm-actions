/** Read the home catalog only inside the short-lived IYF WebHelm session. */
const SECTIONS = [
  ['filmList','电影'], ['tvList','电视剧'], ['varietyList','综艺'],
  ['animeList','动漫'], ['shortList','短剧'], ['documentaryList','纪录片'], ['sportList','体育'],
];
const CATALOG='https://m10.iyf.tv/v3/home/getAllVideo?cinema=1&set=1&size=13&isTopic=1&v=1&cacheable=1';
const validId = x => typeof x==='string' && /^[A-Za-z0-9_-]{6,64}$/.test(x);

export function normalizeIyfHome(data) {
  const info = data?.data?.info?.[0];
  if (!info || typeof info!=='object') throw new Error('Invalid IYF catalog');
  const items=[];
  for (const [key, category] of SECTIONS) for (const show of (info[key]||[])) {
    if (!validId(show.key) || !show.title) continue;
    const poster=typeof show.image==='string' && /^https:\/\/static\.iyf\.tv\/upload\/video\//.test(show.image)
      ? show.image.split('?')[0]+'?w=320&h=450&format=jpg&mode=crop&v=2':'';
    items.push({kind:'show',title:String(show.title).slice(0,120),show:show.key,
      poster,description:String(show.contxt||'').slice(0,280),category,
      genre:String(show.cidMapper||show.cid||'').slice(0,55),year:String(show.year||''),
      lastKey:String(show.lastKey||''),rating:String(show.rating||'')});
  }
  return items;
}
export default async function home({helpers:h,log=()=>{}}){
  await h.goto_url('https://www.iyf.tv/');
  await h.wait_for_load();
  const script='(async()=>{const r=await fetch('+JSON.stringify(CATALOG)+',{credentials:"omit"});if(!r.ok)throw Error("IYF catalog HTTP "+r.status);return await r.json();})()';
  const value=await h.js(script);
  const data=typeof value==='string'?JSON.parse(value):value;
  const items=normalizeIyfHome(data);
  if (!items.length)throw new Error('IYF home catalog returned no entries');
  log('IYF home catalog loaded ('+items.length+' entries)');
  return {ok:true,source:'iyf.tv',items};
}
