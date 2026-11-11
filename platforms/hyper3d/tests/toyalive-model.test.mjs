import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {goalPolicy} from '../actions/_toyalive-model.mjs';
import toyaliveModel from '../actions/_toyalive-model.mjs';

const url='https://hyper3d.ai/workspace/rodin';
function sandbox() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hyper3d-toyalive-'));
  const image=path.join(root,'upright.jpg');
  execFileSync('python3',['-c', 'from PIL import Image; import sys; Image.new("RGB", (256,256), (255,240,200)).save(sys.argv[1],"JPEG")',image]);
  return {root,image,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function config(image, candidate_id='review-panda-001') {
  return {candidate_id,operation:'run',photos:[{path:image,direction:'Front'}],
    effort:'High',agentic:false,face:'eyes-mouth',body:'rigged',motion:'idle',
    confirm_generation:true,max_credits:0.5};
}

test('high-level plan includes separate face verification and motion rigging',()=>{
  const plan=goalPolicy({effort:'High',body:'rigged',face:'eyes-mouth'});
  assert.equal(plan.effort,'High');
  assert.ok(plan.stages.includes('inspect-face'));
  assert.ok(plan.stages.includes('validate-animation'));
  assert.ok(plan.caveat.includes('does not prove blinking'));
  assert.throws(()=>goalPolicy({face:'guaranteed-lipsync'}));
  assert.throws(()=>goalPolicy({effort:'Premium'}));
});

test('status of unknown run is not_started without side effects',async()=>{
  const t=sandbox();
  try {
    const state=await toyaliveModel({config:{candidate_id:'never-started',operation:'status'},helpers:{}},{stateRoot:t.root});
    assert.equal(state.status,'not_started');
    assert.deepEqual(fs.readdirSync(t.root),['upright.jpg']);
  } finally {t.cleanup()}
});

test('unverifiable page input leaves durable blocked state and never submits credits',async()=>{
  const t=sandbox();let generated=0;
  try {
    const h={page_info:async()=>({url}),js:async()=>false,
      click:async()=>{generated++}};
    const first=await toyaliveModel({config:config(t.image),helpers:h},{stateRoot:t.root});
    assert.equal(first.status,'blocked');
    assert.equal(first.blocked_reason,'image_to_3d_mode_unavailable');
    assert.equal(generated,0);
    const second=await toyaliveModel({config:{candidate_id:'review-panda-001',operation:'status'},helpers:h},{stateRoot:t.root});
    assert.equal(second.status,'blocked');
    const different=path.join(t.root,'different.jpg');fs.copyFileSync(t.image,different);fs.appendFileSync(different,Buffer.from('changed'));
    await assert.rejects(toyaliveModel({config:config(different),helpers:h},{stateRoot:t.root}),/Immutable candidate/);
  } finally {t.cleanup()}
});

test('verified generation clicks once and duplicate run cannot spend again',async()=>{
  const t=sandbox();let clicked=0,jsCall=0;
  const responses=[
    true, // image mode selected
    {effort:'Select Effort High',agentic:'false'}, // configure before
    'already_off', // agentic off
    {ok:true}, // select mode in dialog
    {effort:'High',agentic:'false',generationCostText:'0.5 Credits'}, // verify
    0, // previous uploaded thumbnail count
    {count:1,hasManualGenerate:true,fileInputCount:1}, // upload accepted
    {enabled:true,thumb:1,credits:0.5}, // price preflight
    {queued:true,task_id:null,action_state:'GENERATING'}, // manual UI state; no Featured ID
  ];
  try {
    const h={page_info:async()=>({url}),js:async()=>responses[jsCall++],
      upload_file:async()=>({uploaded:true}),
      click:async selector=>{if(selector.includes('newrodin_generateBtn'))clicked++}};
    const first=await toyaliveModel({config:config(t.image),helpers:h},{stateRoot:t.root});
    assert.equal(first.status,'submitted');
    assert.equal(first.site_task_id,null);
    assert.equal(clicked,1);
    const second=await toyaliveModel({config:config(t.image),helpers:h},{stateRoot:t.root});
    assert.equal(second.status,'submitted');
    assert.equal(clicked,1);
  } finally {t.cleanup()}
});

test('session-interrupted Generate never gets an automatic second click',async()=>{
  const t=sandbox();let clicked=0,jsCall=0;
  const responses=[true,{effort:'High',agentic:'false'},'already_off',{ok:true},
    {effort:'High',agentic:'false',generationCostText:'0.5 Credits'},0,
    {count:1,hasManualGenerate:true,fileInputCount:1},{enabled:true,thumb:1,credits:0.5}];
  try {
    const h={page_info:async()=>({url}),js:async()=>responses[jsCall++],
      upload_file:async()=>({uploaded:true}),click:async selector=>{
        if(selector.includes('newrodin_generateBtn')) {clicked++;throw Error('browser deadline');}
      }};
    const first=await toyaliveModel({config:config(t.image),helpers:h},{stateRoot:t.root});
    assert.equal(first.status,'submission_uncertain');
    const second=await toyaliveModel({config:config(t.image),helpers:h},{stateRoot:t.root});
    assert.equal(second.status,'submission_uncertain');
    assert.equal(clicked,1);
  } finally {t.cleanup()}
});

test('per-candidate lock stays held across asynchronous browser work',async()=>{
  const t=sandbox();let entered,release;
  const enteredPromise=new Promise(resolve=>entered=resolve);
  const gate=new Promise(resolve=>release=resolve);
  try {
    const h={page_info:async()=>({url}),js:async()=>{entered();await gate;return false}};
    const first=toyaliveModel({config:config(t.image),helpers:h},{stateRoot:t.root});
    await enteredPromise;
    await assert.rejects(toyaliveModel({config:config(t.image),helpers:h},{stateRoot:t.root}),/already being processed/);
    release();
    assert.equal((await first).status,'blocked');
  } finally {release?.();t.cleanup()}
});

test('public publication requires explicit owner approval',async()=>{
  const t=sandbox();
  try {
    await assert.rejects(toyaliveModel({config:{candidate_id:'some-model',operation:'publish',source_usdz:t.image},helpers:{}},{stateRoot:t.root}),/public_model_approved/);
  } finally {t.cleanup()}
});

test('recovers an already finished rig from authoritative private provider ledger with no second API call',async()=>{
  const home=fs.mkdtempSync(path.join(os.homedir(),'.hyper3d-recovery-test-'));
  try {
    const id='rig-recovered-abc';
    const source=path.join(home,'source.usdz');
    fs.writeFileSync(source,Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04]),Buffer.alloc(250,0x20)]));
    const digest=(await import('node:crypto')).createHash('sha256').update(fs.readFileSync(source)).digest('hex');
    fs.mkdirSync(path.join(home,'scripts'),{recursive:true});
    fs.writeFileSync(path.join(home,'scripts','rodin_rigging_eval.py'),'# mocked runner: recovery must never execute it\n');
    const rigDir=path.join(home,'.build','rodin-rigging-eval',id);
    fs.mkdirSync(rigDir,{recursive:true});
    fs.writeFileSync(path.join(rigDir,'submission.json'),JSON.stringify({status:'finished',source_sha256:digest}));
    fs.writeFileSync(path.join(rigDir,'model.usdz'),Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04]),Buffer.alloc(250,0x30)]));
    const stateDir=path.join(home,'states',id);
    fs.mkdirSync(stateDir,{recursive:true});
    fs.writeFileSync(path.join(stateDir,'state.json'),JSON.stringify({id,stage:'rig_submission_uncertain',source_digest:digest,policy:goalPolicy({})}));
    const v=await toyaliveModel({config:{operation:'rig',candidate_id:id,source_usdz:source},helpers:{}},
      {stateRoot:path.join(home,'states'),projectRoot:home,
        runCommand:()=>{throw Error('Unexpected charge or process invocation')}});
    assert.equal(v.status,'model_ready');
    assert.equal(v.recovered_from,'provider_ledger');
    assert.equal(v.source_usdz,path.join(rigDir,'model.usdz'));
  }finally{fs.rmSync(home,{recursive:true,force:true})}
});
