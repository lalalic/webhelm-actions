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
  assert.deepEqual(steps,[]); // already in Mine: do not reset lazy-loaded assets
});
test('preserves already-scrolled Mine cards on Worknode without navigation or scrolling',async()=>{
  let calls=0;
  const cards=[
    {id:'ba42a572-84b1-467e-9dd4-86c63fd707cb',step:'ModelGenerate',state:null,busy:false,type:null},
    {id:'7d7810fa-1aa0-4963-b35b-6fa027452402',step:'ModelGenerate',state:null,busy:false,type:null},
    {id:'006637b7-1b7b-4e39-aef0-fb9da27346bd',step:'TextureGenerate',state:null,busy:false,type:null},
    {id:'1eeea24a-deb6-4308-b811-62152e2c310e',step:'ModelGenerate',state:null,busy:false,type:null},
  ];
  const result=await assets({helpers:{
    page_info:async()=>({url:'https://hyper3d.ai/workspace/rodin/tab/mine'}),
    goto_url:async()=>{throw new Error('must not reload Mine');},
    js:async()=>{calls++; return calls===1 ? 4 : {cards,visible_count:4,listing_ended:true,page_state:'complete',view_result:true};},
  }});
  assert.equal(result.status,'visible');
  assert.equal(result.cards.length,4);
  assert.equal(result.scroll,null);
});

test('navigates to Mine only if currently in another Rodin page',async()=>{
  let url='https://hyper3d.ai/workspace/rodin';
  let count=0, jumps=0;
  const result=await assets({config:{scroll:false},helpers:{
    page_info:async()=>({url}),
    goto_url:async u=>{url=u;jumps++;},
    wait_for_load:async()=>{},
    js:async()=>++count===1 ? 0 : {cards:[],visible_count:0,listing_ended:true,page_state:'complete',view_result:false},
  }});
  assert.equal(jumps,1);
  assert.equal(result.url,'https://hyper3d.ai/workspace/rodin/tab/mine');
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
test('multiview upload atomically selects four local photos and validates all thumbnails',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hyper3d-four-'));
  const photos=Array.from({length:4},(_,i)=>{
    const f=path.join(temp,`view-${i}.jpg`);
    fs.writeFileSync(f,Buffer.alloc(512,i));
    return f;
  });
  const calls=[];
  let read=0;
  try {
    const v=await references({config:{files:photos},helpers:{
      page_info:async()=>({url:'https://hyper3d.ai/workspace/rodin'}),
      cdp:async(method,params)=>{
        calls.push({method,params});
        if(method==='DOM.getDocument')return {root:{nodeId:1}};
        if(method==='DOM.querySelector')return {nodeId:22};
        return {};
      },
      js:async()=>{read++;return read===1?'hidden':read===2?'visible':read===3?0:{count:4,fileInputCount:4,hasManualGenerate:true};},
    }});
    assert.equal(v.status,'reference_ready');assert.equal(v.count,4);
    const sent=calls.find(c=>c.method==='DOM.setFileInputFiles');
    assert.deepEqual(sent.params.files,photos);
    assert.equal(v.direction_labels_verified,false);
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
