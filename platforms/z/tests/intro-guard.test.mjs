import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNoBlockingIntro,INTRO_BLOCKER_STATE,APP_READY,STREAM_OBSERVER,STREAM_STATE,run} from '../actions/_lifecycle_common.mjs';

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


test('Z Action entrypoints hot-reload their lifecycle dependency by mtime',async()=>{
  const {readFileSync}=await import('node:fs');
  for(const action of ['_new_thread.mjs','_new_turn.mjs']){
    const code=readFileSync(new URL('../actions/'+action,import.meta.url),'utf8');
    assert.match(code,/statSync\(fileURLToPath\(lifecycleUrl\)\)\.mtimeMs/);
    assert.match(code,/import\(lifecycleUrl\.href\+'\?mtime='\+mtime\)/);
    assert.match(code,/await latestRun\(\)/);
  }
});

test('Z lifecycle initializes hidden tabs before native message submission, without token in URL',async()=>{
  const {readFileSync}=await import('node:fs');
  const code=readFileSync(new URL('../actions/_lifecycle_common.mjs',import.meta.url),'utf8');
  assert.match(code,/Page\.addScriptToEvaluateOnNewDocument/);
  assert.match(code,/source: HIDDEN_FRAME_COMPAT/);
  assert.match(code,/waitForAppReady\(h,/);
  assert.match(code,/input:prompt:submit/);
  assert.doesNotMatch(code,/Input\.insertText/);
  assert.doesNotMatch(code,/await h\.click\(SEND_BUTTON\)/);
});


test('Z new-turn does not reload a browser already on its verified Thread',async()=>{
  const {readFileSync}=await import('node:fs');
  const code=readFileSync(new URL('../actions/_lifecycle_common.mjs',import.meta.url),'utf8');
  assert.match(code,/const alreadyOnThread=mode==='new-turn'&&activeThread===expected/);
  assert.match(code,/if \(!alreadyOnThread\) await h\.goto_url\(targetUrl\(expected\)\)/);
});


test('real Z new-turn lifecycle reuses the existing Thread, with exactly one native submit event',async()=>{
  const thread='7826c1b6-19cd-4ebf-9a8f-bc2b85e98096';
  let navigation=0,submission=0,verified=0;
  const commands=[];
  const h={
    async page_info(){return {url:'https://chat.z.ai/c/'+thread}},
    async cdp(command){commands.push(command);return {}},
    async goto_url(){navigation++},
    async wait_for_load(){},
    async wait_for_element(){},
    async js(script){
      if(script===INTRO_BLOCKER_STATE)return false;
      if(script===APP_READY){verified++;return true}
      if(script===STREAM_OBSERVER)return undefined;
      if(script===STREAM_STATE)return {count:0,latest:null};
      if(script.includes('attachmentCount:'))return {composer:true,text:'',attachmentCount:0};
      if(script.includes("document.querySelectorAll('.user-message')"))return submission;
      if(script.includes('o.submission='))return true;
      if(script.includes('new MessageEvent')){submission++;return true}
      throw Error('Unexpected Z browser command: '+script.slice(0,85));
    },
  };
  const receipt=await run({thread_id:thread,message:'test follow-up',wait:false,timeout_seconds:4},'new-turn',h);
  assert.equal(navigation,0,'existing Z thread must never be reloaded');
  assert.equal(submission,1,'Z site submit bridge must be used exactly once');
  assert.equal(verified,1,'site initialization must be verified before send');
  assert.deepEqual(commands,['Page.addScriptToEvaluateOnNewDocument','Page.addScriptToEvaluateOnNewDocument']);
  assert.equal(receipt.thread_id,thread);
  assert.equal(receipt.status,'submitted');
  assert.match(receipt.verified_by,/matching user message/);
});
