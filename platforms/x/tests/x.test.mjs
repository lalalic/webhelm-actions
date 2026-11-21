import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyXHeartbeat} from '../actions/_heartbeat.mjs';
import {metricCount,normalizeTweet,searchUrl} from '../actions/_search.mjs';

test('X heartbeat requires authenticated account-specific browser UI',()=>{
  assert.equal(classifyXHeartbeat({url:'https://x.com/home',accountSwitcher:true,profileLink:true,homeLink:true}),'alive');
  assert.equal(classifyXHeartbeat({url:'https://x.com/home'}),'unknown');
  assert.equal(classifyXHeartbeat({url:'https://x.com/i/flow/login'}),'login_required');
  assert.equal(classifyXHeartbeat({url:'https://example.com/home',accountSwitcher:true,profileLink:true,homeLink:true}),'unknown');
});

test('X search validates query and normalizes URL date filters',()=>{
  const url=new URL(searchUrl({query:'short drama',since:'2026-10-22',until:'2026-11-22'}));
  assert.equal(url.origin,'https://x.com');
  assert.equal(url.searchParams.get('q'),'short drama since:2026-10-22 until:2026-11-22');
  assert.equal(url.searchParams.get('f'),'live');
  assert.throws(()=>searchUrl({query:''}));
  assert.throws(()=>searchUrl({query:'a',since:'yesterday'}));
});

test('metrics and tweets normalize X search cards',()=>{
  assert.equal(metricCount('1.2K Likes. Like'),1200);
  assert.equal(metricCount('1,234 Likes. Like'),1234);
  assert.equal(metricCount('0 Replies. Reply'),0);
  const post=normalizeTweet({id:'2124156519163789534',author_handle:'arnaudmercier',created_at:'2026-11-21T15:02:33.000Z',text:'story',likes:'9 Likes. Like',replies:'2 Replies. Reply',reposts:'1 repost. Repost'});
  assert.equal(post.likes,9);assert.equal(post.replies,2);assert.equal(post.reposts,1);
  assert.equal(post.quotes,0);
  assert.equal(normalizeTweet({id:'not-a-real-id'}),null);
});
