import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assets from '../actions/_assets.mjs';
import configure from '../actions/_configure.mjs';
import references from '../actions/_references.mjs';
import {isWorkspace} from '../actions/_workspace.mjs';

test('workspace guard rejects lookalike hosts and login routes',()=>{
  assert.equal(isWorkspace('https://hyper3d.ai/workspace/rodin/tab/mine'),true);
  assert.equal(isWorkspace('https://hyper3d.ai.evil.net/workspace/rodin'),false);
  assert.equal(isWorkspace('https://hyper3d.ai/login'),false);
  assert.equal(isWorkspace('http://hyper3d.ai/workspace/rodin'),false);
});
test('assets never invents prior work if UI has no visible cards',async()=>{
  const steps=[];
  const v=await assets({helpers:{
    goto_url:async u=>steps.push(['navigate',u]),wait_for_load:async()=>{},
    page_info:async()=>({url:'https://hyper3d.ai/workspace/rodin/tab/mine'}),
    js:async()=>({cards:[],visible_count:0,listing_ended:true,page_state:'complete',view_result:false}),
  }});
  assert.equal(v.status,'empty_or_unloaded');assert.equal(v.cards.length,0);
  assert.deepEqual(steps,[['navigate','https://hyper3d.ai/workspace/rodin/tab/mine']]);
});
test('configure only changes visible settings; does not submit credits',async()=>{
  let count=0;const clicks=[];
  const v=await configure({config:{effort:'High',agentic:false},helpers:{
    page_info:async()=>({url:'https://hyper3d.ai/workspace/rodin'}),
    click:async s=>clicks.push(s),
    js:async()=>{
      const i=count++;
      return i===0?{effort:'Select Effort High',agentic:'true'}:
        i===1?'exit_agentic':i===2?{ok:true}:
        {effort:'High',agentic:'false',generationCostText:'0.5 Credits'};
    },
  }});
  assert.equal(v.submitted,false);assert.equal(v.billed,false);
  assert.equal(v.after.effort,'High');
  assert.deepEqual(clicks,['button[aria-label="Open model selection"]']);
});
test('configure rejects unrecognized effort before browser mutation',async()=>{
  await assert.rejects(configure({config:{effort:'ultra'},helpers:{page_info:async()=>({url:'https://hyper3d.ai/workspace/rodin'})}}),/effort/);
});
test('reference action refuses to claim successful upload without thumbnail',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hyper3d-test-'));
  const photo=path.join(temp,'sample.jpg');fs.writeFileSync(photo,Buffer.alloc(150,0x22));
  try {
    let count=0;const v=await references({config:{files:[photo]},helpers:{
      page_info:async()=>({url:'https://hyper3d.ai/workspace/rodin'}),
      upload_file:async()=>({uploaded:true}),
      js:async()=>count++===0?0:{count:0,ready:false,fileInputCount:1}
    }});
    assert.equal(v.status,'blocked');assert.equal(v.submitted,false);
    assert.equal(v.reason,'browser_did_not_accept_reference');
  } finally {fs.rmSync(temp,{recursive:true,force:true})}
});
test('editing inspector is non-billable and reports rendered controls', async()=>{
  const {default:editing}=await import('../actions/_editing.mjs');
  let n=0;
  const result=await editing({helpers:{
    page_info:async()=>({url:'https://hyper3d.ai/workspace/rodin'}),
    js:async()=> n++===0 ? true : {parts:true,refine:true,modify:true,preview_text:'Free Preview',visible_formats:['.obj','.fbx','.glb'],mode_available:true},
  }});
  assert.equal(result.status,'ready');assert.equal(result.billed,false);
  assert.equal(result.preview_text,'Free Preview');
  assert.deepEqual(result.visible_formats,['.obj','.fbx','.glb']);
});
