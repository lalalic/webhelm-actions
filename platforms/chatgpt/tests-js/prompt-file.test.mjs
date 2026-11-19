import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {run as newThread} from '../actions/_new_thread.mjs';
import {run as newTurn} from '../actions/_new_turn.mjs';
import {withPromptFile,deliveryMessage,PROMPT_FILE_MESSAGE,PROMPT_FILE_THRESHOLD} from '../actions/_prompt-file.mjs';
import {SEND_ENABLED_JS,CLICK_SEND_JS} from '../runtime/lifecycle-common.mjs';

function browserFixture(){
  const calls={uploads:[],navigation:[],clicks:0};
  let clicked=false;
  const helpers={
    sleep:async()=>{},
    goto_url:async url=>{calls.navigation.push(url)},
    wait_for_load:async()=>{},
    page_info:async()=>({url:'https://chatgpt.com/c/same-thread'}),
    upload_file:async (selector,file)=>{
      assert.equal(selector,'input[type="file"]');
      assert.ok(existsSync(file));
      assert.ok(file.endsWith('/prompt.md'));
      calls.uploads.push({file,text:readFileSync(file,'utf8')});
    },
    js:async script=>{
      if(script===SEND_ENABLED_JS)return !clicked;
      if(script===CLICK_SEND_JS){clicked=true;calls.clicks++;return true;}
      if(script.includes('const b=[...document.querySelectorAll(\'button\')],f=n'))return 'chat';
      if(script.includes('could not load this chatgpt conversation'))return null;
      if(script.includes('input[name="upload-media"]'))return 'input[type="file"]';
      if(script.includes('button[aria-label^="Remove "]'))return {names:['prompt.md'],pending:false};
      if(script.includes('const roles='))return clicked?[new URL(calls.navigation.at(-1)).searchParams.get('prompt')]:[];
      return null;
    },
  };
  return {calls,helpers};
}

test('2000-char boundary matches durable queue; short messages do not allocate files',async()=>{
  assert.equal(PROMPT_FILE_THRESHOLD,2000);
  assert.equal(deliveryMessage('x'.repeat(2000)),'x'.repeat(2000));
  assert.equal(deliveryMessage('x'.repeat(2001)),PROMPT_FILE_MESSAGE);
  const fixture=browserFixture();
  await withPromptFile(fixture.helpers,'short',async delivered=>assert.equal(delivered,'short'));
  assert.equal(fixture.calls.uploads.length,0);
});

test('large prompt.md keeps exact text and is removed after callback; also cleans on failure',async()=>{
  const f=browserFixture(),long='\n Leading and trailing spaces  '+ '中文'.repeat(1300)+'  ';
  let attachmentPath;
  const result=await withPromptFile(f.helpers,long,async delivered=>{
    assert.equal(delivered,PROMPT_FILE_MESSAGE);
    attachmentPath=f.calls.uploads[0].file;
    assert.equal(f.calls.uploads[0].text,long);
    assert.ok(existsSync(attachmentPath),'exists through confirmed submission');
    return 'submitted';
  });
  assert.equal(result,'submitted');
  assert.equal(existsSync(attachmentPath),false,'temporary prompt.md removed');
  await assert.rejects(()=>withPromptFile(f.helpers,long,async()=>{
    attachmentPath=f.calls.uploads[1].file;
    throw Error('submission refused');
  }),/submission refused/);
  assert.equal(existsSync(attachmentPath),false,'also removes file on failure');
});

test('new-thread uses prompt.md for >2k chars and returns real thread receipt',async()=>{
  const f=browserFixture(),long='  '+'A'.repeat(2400)+' last-word  \n';
  const result=await newThread({helpers:f.helpers,config:{message:long,mode:'chat',temporary:false}});
  assert.equal(result.status,'submitted');
  assert.equal(result.thread_id,'same-thread');
  assert.equal(result.verified_by,'user-turn');
  assert.equal(f.calls.clicks,1);
  assert.equal(f.calls.uploads.length,1);
  assert.equal(f.calls.uploads[0].text,long);
  assert.ok(f.calls.navigation.length>=1);
  assert.ok(f.calls.navigation.every(u=>new URL(u).searchParams.get('prompt')===PROMPT_FILE_MESSAGE));
  assert.equal(existsSync(f.calls.uploads[0].file),false);
});

test('new-turn sync uses prompt.md for >2k chars; async remains queue-owned',async()=>{
  const f=browserFixture(),long='  '+'B'.repeat(2100)+'  \n';
  const result=await newTurn({helpers:f.helpers,config:{mode:'sync',thread_id:'same-thread',message:long}});
  assert.equal(result.status,'submitted');
  assert.equal(result.verified_by,'user-turn');
  assert.equal(f.calls.uploads.length,1);
  assert.equal(f.calls.uploads[0].text,long);
  assert.equal(f.calls.clicks,1);
  assert.equal(new URL(f.calls.navigation[0]).searchParams.get('prompt'),PROMPT_FILE_MESSAGE);
  assert.equal(existsSync(f.calls.uploads[0].file),false);
  const q={};
  const asyncResult=await newTurn({
    helpers:{enqueueChatGPTTurn:async v=>(Object.assign(q,v),{queue_id:'q1',status:'queued',thread_id:v.thread_id})},
    config:{mode:'async',thread_id:'same-thread',message:long,idempotency_key:'key1'},
  });
  assert.equal(asyncResult.queue_id,'q1');
  assert.equal(q.message,long,'queue receives full original text for its own file transport');
});


test('top-instructions remain visible for large Project-free model prompt; full original stays only in prompt.md',async()=>{
  const f=browserFixture();
  const id='resp_'+'1'.repeat(40);
  const instructions='<top-instructions>\nHeartbeat via chat_report then report text and send completed:true separately.\n</top-instructions>';
  const original=instructions+'\n\nNeo model request: '+id+'\n\n[USER]\n'+ 'text'.repeat(1300)+'\n[/USER]';
  const expected=instructions+'\n\nNeo model request: '+id+'\n\n'+PROMPT_FILE_MESSAGE;
  assert.equal(deliveryMessage(original),expected);
  assert.ok(expected.length<PROMPT_FILE_THRESHOLD);
  const result=await newThread({helpers:f.helpers,config:{message:original,mode:'chat',temporary:false}});
  assert.equal(result.status,'submitted');
  assert.equal(f.calls.uploads[0].text,original);
  assert.equal(new URL(f.calls.navigation[0]).searchParams.get('prompt'),expected);
  assert.ok(!f.calls.navigation[0].includes('text'.repeat(50)));
  const f2=browserFixture();
  const follow=await newTurn({helpers:f2.helpers,config:{mode:'sync',thread_id:'same-thread',message:original}});
  assert.equal(follow.status,'submitted');
  assert.equal(f2.calls.uploads[0].text,original);
  assert.equal(new URL(f2.calls.navigation.at(-1)).searchParams.get('prompt'),expected);
});

test('top-instructions cannot overflow short composer and generic prompts keep old fallback',async()=>{
  const id='resp_'+'2'.repeat(40);
  const oversized='<top-instructions>\n'+'A'.repeat(1850)+'\n</top-instructions>\n\nNeo model request: '+id+'\n\n'+'X'.repeat(4000);
  assert.equal(deliveryMessage(oversized),PROMPT_FILE_MESSAGE);
  const generic='hello'+ 'X'.repeat(3000);
  assert.equal(deliveryMessage(generic),PROMPT_FILE_MESSAGE);
  const unclosed='<top-instructions>not closed'+'x'.repeat(4000);
  assert.equal(deliveryMessage(unclosed),PROMPT_FILE_MESSAGE);
});
