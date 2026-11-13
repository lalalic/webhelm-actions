import test from 'node:test';
import assert from 'node:assert/strict';
import youtube,{classifyYoutubeStudioHeartbeat} from '../youtube/actions/_heartbeat.mjs';
import tiktok,{classifyTiktokStudioHeartbeat} from '../tiktok/actions/_heartbeat.mjs';

const youtubePage='https://studio.youtube.com/channel/UCexample123';
const tiktokPage='https://www.tiktok.com/tiktokstudio';
test('YouTube Creator Studio uses hydrated channel dashboard rather than redirect as login proof',()=>{
  assert.equal(classifyYoutubeStudioHeartbeat({url:youtubePage,body:'',hasStudioApp:true}),'unknown');
  assert.equal(classifyYoutubeStudioHeartbeat({url:youtubePage,body:'Channel dashboard Create',hasStudioApp:true,hasDashboard:true}),'alive');
  assert.equal(classifyYoutubeStudioHeartbeat({url:'https://accounts.google.com/ServiceLogin'}),'login_required');
  assert.equal(classifyYoutubeStudioHeartbeat({url:'https://studio.youtube.com/',body:'Channel dashboard Create',hasStudioApp:true,hasDashboard:true}),'unknown');
  assert.equal(classifyYoutubeStudioHeartbeat({url:'https://evil.example/channel/UCa',body:'Channel dashboard Create',hasStudioApp:true,hasDashboard:true}),'unknown');
});
test('TikTok creator login signal overrides misleading background content',()=>{
  assert.equal(classifyTiktokStudioHeartbeat({url:tiktokPage,body:'Posts Analytics'}),'unknown');
  assert.equal(classifyTiktokStudioHeartbeat({url:tiktokPage,body:'Posts Analytics',hasAccount:true,hasUpload:true}),'alive');
  assert.equal(classifyTiktokStudioHeartbeat({url:'https://www.tiktok.com/login'}),'login_required');
  assert.equal(classifyTiktokStudioHeartbeat({url:tiktokPage,body:'Log in to TikTok Posts Analytics',hasAccount:true,hasUpload:true}),'login_required');
  assert.equal(classifyTiktokStudioHeartbeat({url:'https://www.tiktok.com/tiktokstudio',body:'Upload'}),'unknown');
  assert.equal(classifyTiktokStudioHeartbeat({url:'https://example.com/tiktokstudio',body:'Posts Analytics',hasAccount:true,hasUpload:true}),'unknown');
});
function mockHelpers(start, sampled){let navigated=null;return {helpers:{
  async page_info(){return {url:start}},
  async goto_url(url){navigated=url},
  async wait_for_load(){},
  async js(){return sampled}
},getNavigated:()=>navigated};}
test('YouTube heartbeat read-only one-shot result',async()=>{
  const h=mockHelpers('https://example.org/',{url:youtubePage,body:'Your channel Upload videos',hasStudioApp:true,hasDashboard:true});
  assert.deepEqual(await youtube(h),{status:'alive'});
  assert.equal(h.getNavigated(),'https://studio.youtube.com/');
});
test('TikTok heartbeat read-only one-shot result',async()=>{
  const h=mockHelpers('https://example.org/',{url:tiktokPage,body:'Posts Analytics',hasAccount:true,hasUpload:true});
  assert.deepEqual(await tiktok(h),{status:'alive'});
  assert.equal(h.getNavigated(),'https://www.tiktok.com/tiktokstudio');
});
