import test from 'node:test';
import assert from 'node:assert/strict';
import {prefilledSubmitWithApp,selectChatGPTModel} from '../actions/_action-common.mjs';
import {run as newTurn} from '../actions/_new_turn.mjs';
import {SEND_ENABLED_JS} from '../runtime/lifecycle-common.mjs';

test('structured App mention is inserted before the REAL Send click, with original prompt intact',async()=>{
  const prompt='<top-instructions>Report a result</top-instructions>\n\nNeo model request: resp_'+ 'a'.repeat(40)+'\n\n[USER] hello [/USER]';
  const events=[];let clicked=false;
  const helpers={
    sleep:async()=>{},
    cdp:async(method,args)=>{assert.equal(method,'Input.insertText');assert.deepEqual(args,{text:'@'});events.push('typed-at')},
    click:async selector=>{assert.equal(selector,'button[aria-label="Send"]');clicked=true;events.push('trusted-send-click')},
    js:async code=>{
      if(code===SEND_ENABLED_JS)return !clicked;
      if(code.includes("const ss=['#prompt-textarea'"))return '#prompt-textarea';
      if(code.includes("c.querySelectorAll('[app-mention-name]')"))return prompt;
      if(code.includes("document.execCommand('delete'"))return true;
      if(code.includes('const wanted=')){events.push('mention-suggestion');return true;}
      if(code.includes("!![...e.querySelectorAll('[app-mention-name]')].find")){events.push('mention-verified');return true;}
      if(code.includes("const success=document.execCommand('insertText'")){events.push('retype-original-prompt');return true;}
      if(code.includes("some(n=>(n.getAttribute('app-mention-name')"))return true;
      if(code.includes("const selectors=['button[aria-label=\"Send\"]"))return 'button[aria-label="Send"]';
      if(code.includes("const roles=[...document.querySelectorAll('[data-message-author-role"))return clicked?[prompt]:[];
      throw Error('Unknown fake browser action: '+code.slice(0,140));
    },
  };
  const result=await prefilledSubmitWithApp(helpers,prompt,'Neo');
  assert.equal(result.verified_by,'user-turn');
  assert.ok(clicked);
  assert.deepEqual(events.slice(0,3),['typed-at','mention-suggestion','mention-verified']);
  assert.ok(events.indexOf('retype-original-prompt')<events.indexOf('trusted-send-click'));
});

test('optional model selection waits for picker hydration and selects Sol without changing app/model by default',async()=>{
  const events=[];let selected=false;let readyChecks=0;
  const helpers={
    sleep:async()=>{},
    click:async selector=>{
      events.push(selector);
      if(selector==='[data-webhelm-model-choice="yes"]')selected=true;
    },
    js:async script=>{
      if(script.includes('getClientRects().length>0'))return ++readyChecks>1;
      if(script.includes("map(e=>(e.innerText||'').trim())"))return ['GPT-6','GPT-5.6 Sol'];
      if(script.includes("setAttribute('data-webhelm-model-choice'"))return true;
      if(script.includes('document.querySelector(\'button[aria-label="Select ChatGPT model"]\')?.innerText'))return selected?'Thinking effort\n5.6 High':'Thinking effort\nHigh';
      throw Error('Unknown picker action: '+script.slice(0,160));
    },
  };
  await selectChatGPTModel(helpers,'GPT-5.6 Sol');
  assert.ok(readyChecks>1);
  assert.deepEqual(events,['button[aria-label="Select ChatGPT model"]','[data-webhelm-model-choice="yes"]']);
  const empty={sleep:async()=>{},js:async()=>{throw Error('called when not requested')},click:async()=>{throw Error('called when not requested')}};
  await selectChatGPTModel(empty,'');
});

test('async newTurn refuses unsupported App/model options instead of silently dropping tool access',async()=>{
  let enqueued=false;
  const helpers={enqueueChatGPTTurn:async()=>{enqueued=true;throw Error('should not enqueue')}};
  for(const config of [{app:'Neo'},{model_choice:'GPT-5.6 Sol'}]){
    await assert.rejects(()=>newTurn({helpers,config:{thread_id:'thread',message:'test',...config}}),/require mode=sync/);
  }
  assert.equal(enqueued,false);
});
