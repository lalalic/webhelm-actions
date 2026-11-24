import test from 'node:test';
import assert from 'node:assert/strict';
import heartbeat, {classifyCloudflareHeartbeat, CLOUDFLARE_AUTH_PROBE} from '../actions/_heartbeat.mjs';
const HOME='https://dash.cloudflare.com/48f0ea7ec980ef726c3132a35a932261/home';
const signedIn={url:HOME, switchAccount:true, userMenu:true,accountHome:true};
test('Cloudflare heartbeat requires authenticated account-home signals',()=>{
  assert.equal(classifyCloudflareHeartbeat(signedIn),'alive');
  assert.equal(classifyCloudflareHeartbeat({...signedIn,accountHome:false}),'unknown');
  assert.equal(classifyCloudflareHeartbeat({...signedIn,switchAccount:false}),'unknown');
  assert.equal(classifyCloudflareHeartbeat({...signedIn,userMenu:false}),'unknown');
  assert.equal(classifyCloudflareHeartbeat({url:HOME}),'unknown');
  assert.equal(classifyCloudflareHeartbeat({url:'https://dash.cloudflare.com/login'}),'login_required');
  assert.equal(classifyCloudflareHeartbeat({url:'https://dash.cloudflare.com/',loginForm:true,signInHeading:true}),'login_required');
  assert.equal(classifyCloudflareHeartbeat({...signedIn,url:'https://example.com/home'}),'unknown');
});
test('Cloudflare Action navigates only to dashboard and reads login flags',async()=>{
  let url=null,calls=0;
  const result=await heartbeat({helpers:{
    async goto_url(u){url=u},
    async wait_for_load(){},
    async js(code){assert.equal(code,CLOUDFLARE_AUTH_PROBE);calls++;return signedIn;},
    async sleep(){throw Error('No retry after authenticated response')},
  }});
  assert.deepEqual(result,{status:'alive'});
  assert.equal(url,'https://dash.cloudflare.com/');
  assert.equal(calls,1);
});
test('Cloudflare Action reports signed-out without trying login',async()=>{
  let calls=0;
  const result=await heartbeat({helpers:{
    async goto_url(){},
    async wait_for_load(){},
    async js(){calls++;return {url:'https://dash.cloudflare.com/login'}},
    async sleep(){throw Error('Login required must stop retries')},
  }});
  assert.deepEqual(result,{status:'login_required'});
  assert.equal(calls,1);
});
