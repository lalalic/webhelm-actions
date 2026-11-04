/** Resolve the actual episode IDs from an iyf.tv show webpage. */
export function validateShowId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(value)) {
    throw new TypeError('config.show_id must be a valid iyf.tv show identifier');
  }
  return value;
}
export default async function episodes({config = {}, helpers: h, log = () => {}}) {
  const show = validateShowId(config.show_id);
  const pageUrl = 'https://www.iyf.tv/play/' + show;
  await h.goto_url(pageUrl);
  await h.wait_for_load();
  let items = [];
  for (let i = 0; i < 8; i++) {
    const data = await h.js(`(()=>{
      const result = [];
      for (const a of document.querySelectorAll('a[href*="/play/"]')) {
        let u;
        try{u=new URL(a.href);}catch{continue;}
        if(u.origin!=='https://www.iyf.tv' || u.pathname!==${JSON.stringify('/play/' + show)})continue;
        const id=u.searchParams.get('id');
        if(!id || !/^[A-Za-z0-9_-]{6,64}$/.test(id))continue;
        result.push({title:(a.textContent||'').trim().slice(0,90) || '播放',episode_id:id,show_id:${JSON.stringify(show)},url:u.origin+u.pathname+'?id='+id});
      }
      return result;
    })()`);
    const all = typeof data === 'string' ? JSON.parse(data) : data;
    items = [...new Map((all || []).map(x => [x.episode_id, x])).values()].slice(0, 160);
    if (items.length) break;
    if (h.wait) await h.wait(.4);
  }
  const result={ok:true,source:'iyf.tv',show_id:show,show_url:pageUrl,episodes:items};
  log('IYF show ' + show + ': ' + items.length + ' episode links.');
  return result;
}
