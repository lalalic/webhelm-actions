/**
 * ToyAlive high-level Rodin workflow. One user-facing Action;
 * implementation detail Actions remain private to this workflow.
 *
 * Operations:
 *  run: validate goal/photos -> configure Creator Gen-2.5 -> upload ->
 *       optionally submit paid generation (receipt/idempotency protected)
 *  status: read local persistent state and visible site tasks
 *  publish: USDZ validation -> compact if needed -> Neo File Service catalog
 *  rig: invoke the local ToyAlive Rodin rigging runner with a source USDZ
 *
 * IMPORTANT: Browser generation != success until a real model is downloaded.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import configure from './_configure.mjs';
import assets from './_assets.mjs';
import {requireWorkspace, parseDOM} from './_workspace.mjs';

const RE = /^[a-z][a-z0-9-]{2,44}$/;
const ROOT = path.join(os.homedir(), 'Workspace', 'toyalive');
const STATE_ROOT = path.join(os.homedir(), 'Library', 'Application Support', 'NeoY', 'hyper3d-toyalive-runs');
const MAX_FILE = 60 * 1024 * 1024;
const EFFORTS = new Set(['Medium','High','Extreme-High']);
const STAGES = new Set(['new','preparing','blocked','reference_ready','submission_uncertain','submitted','model_ready','published','rig_submission_uncertain','rig_submitted']);

export function goalPolicy(config={}) {
  const effort = config.effort || 'High';
  if (!EFFORTS.has(effort)) throw TypeError('effort must be Medium, High or Extreme-High');
  const face = config.face ?? 'eyes-mouth';
  const body = config.body ?? 'rigged';
  const motion = config.motion ?? 'idle';
  if (!['none','eyes-mouth'].includes(face)) throw TypeError('face must be none or eyes-mouth');
  if (!['static','rigged'].includes(body)) throw TypeError('body must be static or rigged');
  if (!['none','idle','gesture'].includes(motion)) throw TypeError('motion must be none, idle or gesture');
  return {effort, agentic:config.agentic === true, preferred_topology:'Raw', face, body, motion,
    stages:['reference-upright','gen-2.5-'+effort.toLowerCase(),
      ...(face==='eyes-mouth'?['inspect-face','partial-edit-if-needed']:[]),
      ...(body==='rigged'?['rig-body','validate-animation']:[]),
      'validate-usdz','publish-neo-file-service','iphone-owner-review'],
    caveat:'A body rig does not prove blinking, visemes or facial blendshapes.'};
}

function safeState(id, root=STATE_ROOT) {
  if (!RE.test(id)) throw TypeError('candidate_id must be lowercase letters, digits and dashes (3–45 chars)');
  return path.join(root,id);
}
function atomicJson(file,obj) {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temp = file + '.tmp-' + crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(temp, JSON.stringify(obj,null,2)+'\n',{mode:0o600,flag:'wx'});
  fs.renameSync(temp,file);
}
async function lock(directory, fn) {
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const folder=path.join(directory,'.lock');
  try { fs.mkdirSync(folder, {mode:0o700}); }
  catch (e) { if(e.code==='EEXIST') throw Error('This ToyAlive candidate is already being processed'); throw e; }
  try { return await fn(); } finally { fs.rmdirSync(folder); }
}
function fileDigest(file) {
  const stat=fs.statSync(file);
  if (!stat.isFile() || stat.size<=16 || stat.size>12*1024*1024) throw TypeError('Reference photo invalid or exceeds 12 MiB');
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function validatePhotos(config) {
  const list=config.photos;
  if (!Array.isArray(list)||list.length<1||list.length>5) throw TypeError('photos must be 1–5 local photo paths');
  const photos=list.map(p=> {
    const f=typeof p==='string'?p:p?.path;
    const direction=typeof p==='string'?'Front':p?.direction||'Unknown';
    if(typeof f!=='string'||!path.isAbsolute(f)||!/\.(jpe?g|png|webp)$/i.test(f)) throw TypeError('Each photo requires an absolute .jpg/.png/.webp path');
    if (!['Front','Back','Left','Right','Unknown','Front Left','Front Right','Back Left','Back Right','Up','Down'].includes(direction)) throw TypeError('Unsupported photo direction');
    const resolved=fs.realpathSync(f);
    return {path:resolved,direction,sha256:fileDigest(resolved)};
  });
  const key=crypto.createHash('sha256').update(JSON.stringify(photos)).digest('hex');
  return {photos,key};
}
function loadState(root) {
  const file=path.join(root,'state.json');
  return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
}
function save(root,state) { atomicJson(path.join(root,'state.json'),state); }
function publicState(s) {
  if (!s) return {status:'not_started'};
  // No private photo paths, API tokens, account identity or browser cookies in output.
  return {status:s.stage,candidate_id:s.id,updated_at:s.updated_at,
    policy:s.policy, blocked_reason:s.blocked_reason??null,
    site_task_id:s.site_task_id??null, file_sha256:s.file_sha256??null,
    published_name:s.published_name??null, download_ready:s.stage==='published',
    submission_receipt:s.submission_receipt??null};
}
function advance(root,s,stage,more={}) {
  if(!STAGES.has(stage)) throw TypeError('Unexpected candidate stage');
  const next={...s,...more,stage,updated_at:new Date().toISOString()};
  save(root,next);return next;
}
function safeUSDZ(input) {
  if (typeof input!=='string'||!path.isAbsolute(input)) throw TypeError('source_usdz must be an absolute path');
  const real=fs.realpathSync(input);
  if (!real.startsWith(os.homedir()+path.sep) || path.extname(real).toLowerCase()!=='.usdz') throw TypeError('source_usdz must be a private local .usdz beneath the owner home directory');
  if (fs.statSync(real).size>200*1024*1024) throw TypeError('USDZ exceeds local processing budget');
  const fd=fs.openSync(real,'r');
  try { const bytes=Buffer.alloc(4);fs.readSync(fd,bytes,0,4,0);if(!bytes.equals(Buffer.from([0x50,0x4b,0x03,0x04]))) throw TypeError('Not a USDZ archive'); }
  finally {fs.closeSync(fd);}
  return real;
}
function runCommand(command,argv,cwd=ROOT,timeout=240000) {
  return execFileSync(command,argv,{cwd,timeout,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:2*1024*1024});
}

/** Execute action with injected dependencies available for deterministic tests. */
export default async function toyaliveModel({config={},helpers:h}, deps={}) {
  const op=config.operation||'run';
  if (!['run','status','publish','rig'].includes(op)) throw TypeError('operation must be run, status, publish or rig');
  const id=config.candidate_id;
  const projectRoot=deps.projectRoot||ROOT;
  const dir=safeState(id, deps.stateRoot||STATE_ROOT);
  const command=deps.runCommand||runCommand;
  // A status read is intentionally non-mutating and safe during concurrent processing.
  if(op==='status') {
    const s=loadState(dir);
    if(config.check_site!==true) return {...publicState(s),site_checked:false};
    await requireWorkspace(h);
    const view=await assets({helpers:h,config:{navigate:true,scroll:true}});
    return {...publicState(s),site_checked:true,site:view};
  }
  if(op==='publish') {
    if(config.public_model_approved!==true) throw TypeError('public_model_approved:true is required: Neo File Service is public read-only');
    const source=safeUSDZ(config.source_usdz);
    return await lock(dir,async()=>{
      const prior=loadState(dir);
      const digest=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
      if(prior?.stage==='published') {
        if(prior.source_digest!==digest) throw Error('Candidate ID immutable; do not replace published bytes');
        return {...publicState(prior),already_published:true};
      }
      let file=source;
      command('usdchecker',[file]);
      if(fs.statSync(file).size>MAX_FILE) {
        const target=path.join(dir,'model-mobile.usdz');
        command('uv',['run','--no-project','--python','3.11','--with','usd-core','--with','numpy',
          'python',path.join(projectRoot,'scripts','rodin_compact_usdz.py'),file,target],projectRoot,300000);
        file=target;
      }
      if(fs.statSync(file).size>MAX_FILE) throw Error('Compacted USDZ still exceeds 60 MiB');
      command('usdchecker',[file]);
      const pubDigest=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      const title=String(config.title||`ToyAlive 3D · ${id}`);
      const detail=String(config.detail||'Generated and verified for ToyAlive owner review');
      if(title.length>120||detail.length>200) throw TypeError('Title or detail too long');
      command('python3',[path.join(projectRoot,'scripts','publish_model_library.py'),
        '--id',id,'--file',file,'--title',title,'--detail',detail]);
      const s=advance(dir,prior||{id,policy:{
        source:'external_usdz',effort:config.source_effort||'Unknown',
        caveat:'The input model already existed; publishing does not prove website generation or facial animation.'
      }},'published',
        {source_digest:digest,file_sha256:pubDigest,published_name:id});
      return {...publicState(s),bytes:fs.statSync(file).size,output_file:id+'.usdz'};
    });
  }
  if(op==='rig') {
    const script=path.join(projectRoot,'scripts','rodin_rigging_eval.py');
    if(!fs.existsSync(script)) return {status:'blocked',candidate_id:id,reason:'rigging_local_runner_not_installed'};
    const policy=goalPolicy(config);
    const prior=loadState(dir);
    if (prior && ['submission_uncertain','published'].includes(prior.stage))
      return {...publicState(prior),next:'Use a distinct candidate_id for rigging; never resubmit an uncertain website task.'};
    const result=await lock(dir,async()=>{
      const s=loadState(dir);
      // An authoritative provider ledger may exist even when a previous
      // high-level invocation timed out. Adopt confirmed task ownership and
      // completed artifacts; never issue a second paid POST in recovery.
      const privateLedger=path.join(projectRoot,'.build','rodin-rigging-eval',id,'submission.json');
      if ((!s || s.stage==='rig_submission_uncertain') && fs.existsSync(privateLedger)) {
        const provider=JSON.parse(fs.readFileSync(privateLedger,'utf8'));
        const digest=s?.source_digest || (config.source_usdz
          ?crypto.createHash('sha256').update(fs.readFileSync(safeUSDZ(config.source_usdz))).digest('hex'):null);
        if (digest && provider.source_sha256===digest && ['submitted','finished'].includes(provider.status)) {
          if (provider.status==='finished') {
            const file=path.join(projectRoot,'.build','rodin-rigging-eval',id,'model.usdz');
            if(fs.existsSync(file)) {
              const recovered=advance(dir,s||{id,policy},'model_ready',{source_usdz:file,source_digest:digest});
              return {...publicState(recovered),source_usdz:file,recovered_from:'provider_ledger'};
            }
          }
          const recovered=advance(dir,s||{id,policy},'rig_submitted',{source_digest:digest});
          return {...publicState(recovered),recovered_from:'provider_ledger'};
        }
      }
      if (s?.stage==='rig_submission_uncertain')
        return {...publicState(s),next:'Inspect private provider ledger; automatic resubmit forbidden.'};
      if (s?.stage==='rig_submitted') {
        let res;
        try {res=JSON.parse(command('python3',[script,'collect','--id',id]));}
        catch {return {...publicState(s),next:'Provider status/download unavailable; resume the same candidate later.'};}
        if (res.status==='finished' && res.model_usdz) {
          const next=advance(dir,s,'model_ready',{source_usdz:res.model_usdz});
          return {...publicState(next),source_usdz:res.model_usdz};
        }
        return {...publicState(s),provider_status:res.status,provider_jobs:res.jobs||[],next:'Call the same action again when the provider completes.'};
      }
      if(s?.stage==='model_ready') return {...publicState(s),source_usdz:s.source_usdz};
      if(config.confirm_rig_credits!==true || typeof config.max_credits!=='number' || config.max_credits<0.5)
        throw TypeError('confirm_rig_credits:true and max_credits >= 0.5 required for first rigging submission');
      const source=safeUSDZ(config.source_usdz);
      const record=advance(dir,s||{id,policy},'rig_submission_uncertain',{
        source_digest:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')});
      let output;
      try {
        const args=[script,'submit','--id',id,'--source',source];
        if(config.reference_photo) args.push('--photo',fs.realpathSync(config.reference_photo));
        if(config.animation)args.push('--animation',config.animation);
        output=JSON.parse(command('python3',args));
      } catch {
        return {...publicState(record),next:'Check private rigging submission record; no automatic duplicate POST.'};
      }
      if(!['submitted','finished'].includes(output.status))
        return {...publicState(record),provider_status:output.status,next:'No proven rigging acceptance. Never resubmit automatically.'};
      const next=advance(dir,record,'rig_submitted',{submission_receipt:JSON.stringify(output).slice(0,200)});
      return {...publicState(next),provider_status:output.status,next:'Call the same action again to collect the rigged USDZ.'};
    });
    if(result.status==='model_ready' && config.public_model_approved===true) {
      return await toyaliveModel({config:{...config,operation:'publish',source_usdz:result.source_usdz},helpers:h},deps);
    }
    return result;
  }
  // run = one high-level resumable task, not a chain callers must compose.
  await requireWorkspace(h);
  const policy=goalPolicy(config);
  const {photos,key}=validatePhotos(config);
  const prompt=typeof config.prompt==='string'?config.prompt.trim():'';
  if(prompt.length>600)throw TypeError('prompt must be 600 characters or fewer');
  const inputKey=crypto.createHash('sha256').update(JSON.stringify({key,prompt})).digest('hex');
  return await lock(dir,async()=>{
    let s=loadState(dir);
    if(s && (s.photo_key!==inputKey||s.policy?.effort!==policy.effort||s.policy?.agentic!==policy.agentic))
      throw Error('Immutable candidate configuration changed; use a fresh candidate_id');
    if(s && ['submission_uncertain','submitted','model_ready','published','rig_submission_uncertain','rig_submitted'].includes(s.stage))
      return {...publicState(s),next:'status_or_publish_only_no_duplicate_generate'};
    s=advance(dir,s||{id,policy,photo_key:inputKey,created_at:new Date().toISOString()},'preparing');
    // EXIF orientation must be baked into pixels before uploading. Keep the
    // original owner photos untouched and stage the prepared copies privately.
    const readyPhotos=[];
    for (const [i,photo] of photos.entries()) {
      const target=path.join(dir,'prepared-'+i+'.jpg');
      if(!fs.existsSync(target)) {
        command('python3',[path.join(projectRoot,'scripts','rodin_photo_prepare.py'),
          '--source',photo.path,'--output',target]);
      }
      readyPhotos.push(target);
    }
    // Select the Image-to-3D mode via the visible Creator controls.
    const mode=parseDOM(await h.js(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Image to 3D');if(!b)return false;b.click();return true})()`));
    if(mode!==true) return publicState(advance(dir,s,'blocked',{blocked_reason:'image_to_3d_mode_unavailable'}));
    const configured=await configure({helpers:h,config:{effort:policy.effort,agentic:policy.agentic}});
    if(prompt) {
      if(typeof h.fill_input!=='function')
        return publicState(advance(dir,s,'blocked',{blocked_reason:'prompt_input_unavailable'}));
      await h.fill_input('textarea[placeholder^="Describe the item"]',prompt);
      const actual=parseDOM(await h.js(`document.querySelector('textarea[placeholder^="Describe the item"]')?.value||''`));
      if(actual!==prompt)
        return publicState(advance(dir,s,'blocked',{blocked_reason:'prompt_not_confirmed'}));
    }
    // Load website upload helper with an mtime key. Persistent WebHelm daemon
    // otherwise retains the old single-file helper after Actions are updated.
    const refURL=new URL('./_references.mjs',import.meta.url);
    const {default: references}=await import(refURL.href+'?mtime='+fs.statSync(refURL).mtimeMs);
    const result=await references({helpers:h,config:{files:readyPhotos}});
    if(result.status!=='reference_ready') {
      s=advance(dir,s,'blocked',{blocked_reason:result.reason||'photo_upload_not_confirmed'});
      return {...publicState(s),photo_upload:result,configured:configured.after,
        next:'Fix Creator image upload; this Action will not submit uncertain inputs.'};
    }
    s=advance(dir,s,'reference_ready',{blocked_reason:null});
    if(config.confirm_generation!==true) return {...publicState(s),submitted:false,next:'Set confirm_generation:true and max_credits when ready.'};
    const max=config.max_credits;
    if(typeof max!=='number'||!Number.isFinite(max)||max<=0||max>5) throw TypeError('Set max_credits number between 0 and 5 for paid generation');
    const pricing=parseDOM(await h.js(`(()=>{
      // The hidden aria-label=GENERATE button belongs to Agentic Mode and is
      // disabled when Agentic is off. Manual mode has a separate visible DIV.
      const b=document.querySelector('.newrodin_generateBtn__cTxM7');
      const near=b?.innerText||'';
      const x=(near.match(/(\\d+(?:\\.\\d+)?)\\s*Credits?/i)||[]);
      return {enabled:!!b&&!!b.getClientRects().length&&!b.className.includes('disabled'),
        credit_label:x[0]||null,credits:x[1]?Number(x[1]):null,
        thumb:document.querySelectorAll('.rodin-homepage-upload-strip img[alt="thumbnail"]').length};
    })()`));
    if(!pricing?.enabled||pricing?.thumb!==photos.length||!Number.isFinite(pricing.credits)||pricing.credits>max)
      return {...publicState(advance(dir,s,'blocked',{blocked_reason:'generation_price_or_reference_preflight_failed'})),preflight:pricing};
    s=advance(dir,s,'submission_uncertain',{expected_credits:pricing.credits,submitted_at:new Date().toISOString()});
    try { await h.click('.newrodin_generateBtn__cTxM7'); }
    catch(e) {return {...publicState(s),next:'Submission may have occurred; inspect website task. Never click Generate again for this candidate.'};}
    const receipt=parseDOM(await h.js(`(()=>{
      const button=document.querySelector('.newrodin_generateBtn__cTxM7');
      const actionState=button?.innerText.split('\n')[0]?.trim()||'';
      const status=[...document.querySelectorAll('[role=status]')]
        .map(e=>e.textContent?.trim()).filter(Boolean);
      // The homepage shows unrelated Featured model cards. NEVER assign the
      // first card's UUID to this submission. Recover the real task ID from
      // the authenticated Mine page when it becomes visible.
      return {task_id:null,action_state:actionState,status:status.slice(0,3),
        queued:['PREPARING','GENERATING'].includes(actionState)};
    })()`));
    if(receipt?.queued) {
      s=advance(dir,s,'submitted',{site_task_id:null,submission_receipt:JSON.stringify(receipt).slice(0,240)});
      return {...publicState(s),next:'Await actual model result, then export USDZ and call the SAME high-level action with operation:publish.'};
    }
    return {...publicState(s),next:'No reliable receipt. Inspect real site before any retry; never auto-resubmit.'};
  });
}
