import {verifySpotifyLogin, parseBrowserData} from './_library.mjs';

export function validateSpotifyMediaUrl(raw) {
  if(typeof raw!=='string')throw new TypeError('config.url is required');
  let url;
  try{url=new URL(raw);}catch{throw new TypeError('invalid_spotify_url');}
  if(url.origin!=='https://open.spotify.com' ||
     !/^\/(playlist|album|track)\/[A-Za-z0-9]{12,40}$/.test(url.pathname) && url.pathname!=='/collection/tracks'){
    throw new TypeError('unsupported_spotify_media_url');
  }
  return url.origin+url.pathname;
}

/**
 * Use the official Spotify Web player only. Never extract streaming media.
 * Requires an explicit playback request. Output is the browser player state,
 * not a claim that a Roku device has been selected.
 */
export default async function play({config={},helpers:h,log=()=>{}}){
  const url=validateSpotifyMediaUrl(config.url);
  if(config.confirm_playback!==true){
    return {ok:false,source:'spotify_web',error:'confirm_playback_required'};
  }
  const auth=await verifySpotifyLogin(h);
  if(!auth.ok)return {ok:false,source:'spotify_web',error:auth.error};
  await h.goto_url(url);
  await h.wait_for_load();
  let primaryButton=false;
  for(let attempt=0;attempt<8;attempt++){
    primaryButton=parseBrowserData(await h.js(
      'Boolean(document.querySelector(\'main button[aria-label^="Play "]\'))'
    ));
    if(primaryButton)break;
    if(h.wait)await h.wait(.35);
  }
  if(!primaryButton)return {ok:false,error:'spotify_play_button_missing',source:'spotify_web',url};
  await h.click('main button[aria-label^="Play "]');
  if(h.wait)await h.wait(.6);
  const current=parseBrowserData(await h.js(`(()=>{
    const pause=Boolean(document.querySelector('button[aria-label="Pause"]'));
    const now=document.querySelector('[data-testid="now-playing-widget"]');
    const currentTitle=(now?.textContent||document.querySelector('[aria-label^="Now playing:"]')?.getAttribute('aria-label')||'').trim().slice(0,150);
    return JSON.stringify({playing:pause,current_title:currentTitle});
  })()`));
  const output={ok:!!current.playing,source:'spotify_web',url,web_player_playing:!!current.playing,
    current_title:current.current_title||'',roku_output_verified:false};
  if(!output.ok)output.error='spotify_playback_not_verified';
  log('Spotify Web playback state '+(output.ok?'playing':'not verified'));
  return output;
}
