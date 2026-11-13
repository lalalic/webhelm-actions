import test from 'node:test';
import assert from 'node:assert/strict';
import xhs, {classifyXhsHeartbeat} from '../xhs/actions/_heartbeat.mjs';
import channels, {classifyChannelsHeartbeat} from '../wechat-channels/actions/_heartbeat.mjs';

const xhsPage='https://creator.xiaohongshu.com/new/note-manager';
const channelsPage='https://channels.weixin.qq.com/platform/post/list';
test('XHS requires explicit creator-dashboard evidence, not a loaded page',()=>{
  assert.equal(classifyXhsHeartbeat({url:xhsPage,body:'',noteCards:0}),'unknown');
  assert.equal(classifyXhsHeartbeat({url:xhsPage,body:'笔记管理 暂无笔记',noteCards:0}),'alive');
  assert.equal(classifyXhsHeartbeat({url:xhsPage,body:'手机验证码登录 笔记管理',noteCards:2}),'login_required');
  assert.equal(classifyXhsHeartbeat({url:'https://creator.xiaohongshu.com/login'}),'login_required');
  assert.equal(classifyXhsHeartbeat({url:'https://example.com/new/note-manager',body:'笔记管理'}),'unknown');
});
test('Channels requires authenticated shadow-DOM evidence',()=>{
  assert.equal(classifyChannelsHeartbeat({url:channelsPage,body:'视频号助手',hasManager:false}),'unknown');
  assert.equal(classifyChannelsHeartbeat({url:channelsPage,hasManager:true,embeddedText:'视频管理 已发表'}),'alive');
  assert.equal(classifyChannelsHeartbeat({url:channelsPage,hasManager:true,managerRows:2}),'alive');
  assert.equal(classifyChannelsHeartbeat({url:channelsPage,hasManager:true,body:'请使用微信扫码登录',embeddedText:'视频管理'}),'login_required');
  assert.equal(classifyChannelsHeartbeat({url:'https://channels.weixin.qq.com/login'}),'login_required');
  assert.equal(classifyChannelsHeartbeat({url:'https://example.com/platform/post/list',hasManager:true,embeddedText:'视频管理'}),'unknown');
});
function mockHelpers(url, page){let navigated=null, sampled=0;return {helpers:{
  async page_info(){return {url}},
  async goto_url(next){navigated=next},
  async wait_for_load(){},
  async js(){sampled++;return page;},
},stats:()=>({navigated,sampled})};}
test('XHS action is read-only and checks dashboard',async()=>{
  const mock=mockHelpers('https://creator.xiaohongshu.com/',{url:xhsPage,body:'笔记管理',noteCards:0});
  assert.deepEqual(await xhs(mock),{status:'alive'});
  assert.equal(mock.stats().navigated,xhsPage);
  assert.equal(mock.stats().sampled,1);
});
test('Channels action checks manager without writes',async()=>{
  const mock=mockHelpers('https://channels.weixin.qq.com/',{url:channelsPage,embeddedText:'动态管理',hasManager:true});
  assert.deepEqual(await channels(mock),{status:'alive'});
  assert.equal(mock.stats().navigated,channelsPage);
  assert.equal(mock.stats().sampled,1);
});
