import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNoBlockingIntro,INTRO_BLOCKER_STATE} from '../actions/_lifecycle_common.mjs';

test('Z introductory modal is recognized exactly, without trying to click or send', async()=>{
  const calls=[];
  await assert.rejects(()=>assertNoBlockingIntro({async js(script){
    calls.push(script);return true;
  }}),/introductory dialog blocks message submission/);
  assert.deepEqual(calls,[INTRO_BLOCKER_STATE]);
});

test('normal Z composer proceeds untouched when there is no known modal',async()=>{
  let checks=0;
  await assertNoBlockingIntro({async js(script){
    assert.equal(script,INTRO_BLOCKER_STATE);checks++;return false;
  }});
  assert.equal(checks,1);
});
