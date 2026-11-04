import {parseBrowserData, verifySpotifyLogin} from './_library.mjs';

export function validateSpotifyQuery(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 120) {
    throw new TypeError('config.query must be nonempty and <=120 characters');
  }
  return value.trim();
}
export default async function search({config = {}, helpers:h, log=()=>{}}) {
  const query=validateSpotifyQuery(config.query);
  const auth=await verifySpotifyLogin(h);
  if (!auth.ok)return {ok:false,source:'spotify_web',error:auth.error};
  const searchUrl='https://open.spotify.com/search/'+encodeURIComponent(query);
  await h.goto_url(searchUrl);
  await h.wait_for_load();
  let results=[];
  for(let attempt=0;attempt<14;attempt++){
    const val=await h.js(`(()=>{
      const all=[];
      for(const a of document.querySelectorAll('main a[href]')){
        let u;try{u=new URL(a.href);}catch{continue;}
        const m=u.pathname.match(/^\\/(track|album|artist|playlist)\\/([A-Za-z0-9]{12,40})$/);
        if(u.origin!=='https://open.spotify.com'||!m)continue;
        const label=(a.textContent||a.getAttribute('aria-label')||'').trim().slice(0,130);
        if(!label)continue;
        all.push({type:m[1],title:label,url:u.origin+u.pathname});
      }
      return JSON.stringify([...new Map(all.map(x=>[x.url,x])).values()].slice(0,60));
    })()`);
    results=parseBrowserData(val)||[];
    if(results.length)break;
    if(h.wait)await h.wait(.65);
  }
  const output={ok:results.length>0,source:'spotify_web',query,search_url:searchUrl,results};
  if(!results.length)output.error='spotify_search_results_not_verified';
  log('Spotify Web search: '+results.length+' verified result links.');
  return output;
}
