import test from 'node:test';
import assert from 'node:assert/strict';
import library,{verifySpotifyLogin} from '../actions/_library.mjs';
import search,{validateSpotifyQuery} from '../actions/_search.mjs';
import play,{validateSpotifyMediaUrl} from '../actions/_play.mjs';

test('Spotify media URLs limited to official playlist, track, album, Liked Songs',()=>{
  assert.equal(validateSpotifyMediaUrl('https://open.spotify.com/collection/tracks'), 'https://open.spotify.com/collection/tracks');
  assert.equal(validateSpotifyMediaUrl('https://open.spotify.com/playlist/5lx0YoRouBkpG9ZDJMyYnM?si=hi'), 'https://open.spotify.com/playlist/5lx0YoRouBkpG9ZDJMyYnM');
  for(const bad of ['https://evil.com/playlist/5lx0YoRouBkpG9ZDJMyYnM','http://open.spotify.com/track/5coTcHT7K8O3G97y9T4LOU','https://open.spotify.com/search/foo']){
    assert.throws(()=>validateSpotifyMediaUrl(bad));
  }
});
test('Spotify search validates user intent',()=>{
  assert.equal(validateSpotifyQuery('  Lonely People  '),'Lonely People');
  assert.throws(()=>validateSpotifyQuery(''));
  assert.throws(()=>validateSpotifyQuery('x'.repeat(121)));
});
test('Spotify login guard does not treat public search as user library',async()=>{
  const helpers={
    page_info:async()=>({url:'https://open.spotify.com/'}),
    snapshot:async()=>'- button "Log in"\n- button "Sign up"',
    wait:async()=>{}
  };
  assert.equal((await verifySpotifyLogin(helpers)).error,'spotify_not_logged_in');
});
test('library reads only authenticated Your Library links, not public results',async()=>{
  let expandClicks=0;
  const h={
    page_info:async()=>({url:'https://open.spotify.com/'}),
    snapshot:async()=>'- button "Lalalic"\n- grid "Your Library"',
    js:async expression=>expression.includes('Boolean(document.querySelector') ? true:JSON.stringify({
      items:[{title:'Liked Songs',kind:'liked_songs',url:'https://open.spotify.com/collection/tracks'},
       {title:'Personal playlist',kind:'playlist',url:'https://open.spotify.com/playlist/5lx0YoRouBkpG9ZDJMyYnM'}]
    }),
    click:async selector=>{assert.match(selector,/Expand Your Library/);expandClicks++;},
    wait:async()=>{}
  };
  const res=await library({helpers:h});
  assert.equal(res.ok,true);assert.equal(res.scope,'your_library');
  assert.equal(res.items.length,2);assert.equal(expandClicks,1);
});
test('Spotify play rejects accidental playback without confirmation',async()=>{
  let count=0;
  const result=await play({config:{url:'https://open.spotify.com/collection/tracks'},helpers:new Proxy({},{get(){count++;throw Error('unexpected')}})});
  assert.equal(result.ok,false);assert.equal(result.error,'confirm_playback_required');assert.equal(count,0);
});
test('Spotify playback Action verifies the browser player, never claims Roku',async()=>{
  const selected=[];
  const h={
    page_info:async()=>({url:'https://open.spotify.com/'}),
    snapshot:async()=>'- button "Lalalic"\n- grid "Your Library"',
    goto_url:async url=>{selected.push(url);},
    wait_for_load:async()=>{},
    wait:async()=>{},
    js:async expression=>expression.startsWith('Boolean(') ? true : JSON.stringify({playing:true,current_title:'Song by Artist'}),
    click:async selector=>selected.push(selector)
  };
  const result=await play({config:{url:'https://open.spotify.com/collection/tracks',confirm_playback:true},helpers:h});
  assert.equal(result.ok,true);assert.equal(result.roku_output_verified,false);
  assert.deepEqual(selected,['https://open.spotify.com/collection/tracks','main button[aria-label^="Play "]']);
});
test('Spotify search Action reports verified real page links',async()=>{
  const h={
    page_info:async()=>({url:'https://open.spotify.com/'}),
    snapshot:async()=>'- button "User"\n- grid "Your Library"',
    goto_url:async()=>{},wait_for_load:async()=>{},wait:async()=>{},
    js:async()=>JSON.stringify([{type:'track',title:'Lonely People',url:'https://open.spotify.com/track/5coTcHT7K8O3G97y9T4LOU'}])
  };
  const result=await search({config:{query:'Lonely People'},helpers:h});
  assert.equal(result.ok,true);assert.equal(result.results[0].type,'track');
});
