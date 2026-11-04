/**
 * Search verified iyf.tv show titles through its real website.
 * Avoid listing unrelated homepage recommendations or individual episode links.
 */
export function validateIyfQuery(query) {
  if (typeof query !== 'string' || !query.trim() || query.length > 80) {
    throw new TypeError('config.query must be a nonempty title (max 80 characters)');
  }
  return query.trim();
}
const BASE = 'https://www.iyf.tv/';

export default async function search({ config = {}, helpers: h, log = () => {} }) {
  const query = validateIyfQuery(config.query);
  const url = BASE + 'search/' + encodeURIComponent(query);
  await h.goto_url(url);
  await h.wait_for_load();
  let results = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const data = await h.js(`(()=>{
      const q=${JSON.stringify(query)};
      const links=Array.from(document.querySelectorAll('a[href*="/play/"]'));
      return links.map(a=>{
        const title=(a.textContent||'').replace(/\\s+/g,' ').trim();
        let path;
        try {path=new URL(a.href).pathname;}catch{return null;}
        const match=path.match(/^\\/play\\/([A-Za-z0-9_-]{6,64})$/);
        if(!match || !title || !title.includes(q) || /^\\d+$/.test(title) || title==='立即播放')return null;
        return {title:title.slice(0,120),show_id:match[1],url:'https://www.iyf.tv'+path};
      }).filter(Boolean);
    })()`);
    const candidates = typeof data === 'string' ? JSON.parse(data) : data;
    results = [...new Map((candidates || []).map(v => [v.show_id, v])).values()].slice(0, 60);
    if (results.length) break;
    // A genuinely empty search must not be confused with a loading skeleton.
    if (attempt < 5 && h.wait) await h.wait(0.4);
  }
  const result = {ok:true,source:'iyf.tv',query,matches:results,search_url:url,verified_from:'website_links'};
  log('IYF search verified ' + results.length + ' matching titles.');
  return result;
}
