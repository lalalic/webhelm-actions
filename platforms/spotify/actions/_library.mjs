/** Read only the signed-in user's actual Spotify Web Library. */
export function parseBrowserData(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}
export async function verifySpotifyLogin(helpers) {
  const page = await helpers.page_info();
  if (!/^https:\/\/open\.spotify\.com\//.test(page.url)) {
    await helpers.goto_url('https://open.spotify.com/');
    await helpers.wait_for_load();
  }
  let snap = '';
  for (let attempt = 0; attempt < 12; attempt++) {
    snap = await helpers.snapshot();
    if (snap.includes('Your Library')) return {ok:true};
    if (/button "Log in"|button "Sign up"|Log in to Spotify/i.test(snap)) {
      return {ok:false,error:'spotify_not_logged_in'};
    }
    if (helpers.wait) await helpers.wait(.35);
  }
  return {ok:false,error:'spotify_library_not_visible'};
}
export async function expandLibrary(helpers) {
  const canExpand = parseBrowserData(await helpers.js(
    'Boolean(document.querySelector(\'button[aria-label="Expand Your Library"]\'))'
  ));
  if (canExpand) {
    await helpers.click('button[aria-label="Expand Your Library"]');
    if (helpers.wait) await helpers.wait(.4);
  }
}
export default async function library({config = {}, helpers:h, log=()=>{}}) {
  const auth = await verifySpotifyLogin(h);
  if (!auth.ok) return {ok:false,source:'spotify_web',...auth};
  await expandLibrary(h);
  let resultData;
  for (let attempt = 0; attempt < 7; attempt++) {
    const val = await h.js(`(()=>{
    const container=document.querySelector('[role="treegrid"][aria-label="Your Library"]') ||
      document.querySelector('[role="grid"][aria-label="Your Library"]');
    if(!container)return JSON.stringify({items:[],error:'library_grid_missing'});
    const items=[];
    for(const a of container.querySelectorAll('a[href]')){
      let u;try{u=new URL(a.href);}catch{continue;}
      const liked=u.origin==='https://open.spotify.com' && u.pathname==='/collection/tracks';
      const playlist=/^\\/playlist\\/[A-Za-z0-9]{12,40}$/.test(u.pathname);
      if(!liked&&!playlist)continue;
      const row=a.closest('[role="row"]');
      const name=(a.textContent||row?.querySelector('[role="group"]')?.textContent||'').trim().split('\\n')[0].slice(0,160);
      if(!name)continue;
      items.push({title:name,kind:liked?'liked_songs':'playlist',url:u.origin+u.pathname,available:!/(this playlist is not available)/i.test(row?.textContent||'')});
    }
    return JSON.stringify({items:[...new Map(items.map(x=>[x.url,x])).values()].slice(0,100)});
  })()`);
    resultData=parseBrowserData(val);
    if(resultData.error || resultData.items?.length)break;
    if(h.wait)await h.wait(.5);
  }
  const result=resultData;
  if (result.error) return {ok:false,source:'spotify_web',error:result.error};
  const output={ok:true,source:'spotify_web',scope:'your_library',items:result.items};
  log('Spotify Web: ' + output.items.length + ' library playlist entries verified.');
  return output;
}
