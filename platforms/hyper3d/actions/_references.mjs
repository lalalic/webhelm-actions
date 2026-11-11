import fs from 'node:fs';
import path from 'node:path';
import { requireWorkspace, parseDOM } from './_workspace.mjs';

/** Upload only user-provided local images and VERIFY the browser accepted them.
 * No credit spending; never automatically generate from an unconfirmed input.
 */
export default async function references({helpers:h, config={}}) {
  await requireWorkspace(h);
  const files = config.files;
  if (!Array.isArray(files) || files.length < 1 || files.length > 5 ||
      files.some(p=>typeof p!=='string'||!path.isAbsolute(p)||!/\.(jpe?g|png|webp)$/i.test(p))) {
    throw TypeError('config.files must be 1–5 absolute image paths');
  }
  // In a managed Tab Group Chrome may leave the leased tab hidden/frozen.
  // Hyper3D's FileReader/image preprocessing then stalls indefinitely while
  // input.files has the right names, causing a false upload failure. Activate
  // only this caller-owned browser tab before dispatching image input.
  if (typeof h.cdp === 'function') {
    const visibility= parseDOM(await h.js('document.visibilityState'));
    if (visibility === 'hidden') {
      await h.cdp('Page.bringToFront',{});
      await h.cdp('Page.setWebLifecycleState',{state:'active'});
      await h.cdp('Emulation.setFocusEmulationEnabled',{enabled:true});
      const after= parseDOM(await h.js('document.visibilityState'));
      if (after !== 'visible')
        return {status:'blocked',reason:'browser_tab_not_visible_for_image_upload',submitted:false,billed:false};
    }
  }
  const resolved = files.map(f=>path.resolve(f));
  for (const file of resolved) {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size<100 || stat.size>10*1024*1024) throw Error('Reference image invalid or too large');
  }
  const before = parseDOM(await h.js('document.querySelectorAll(".rodin-homepage-upload-strip img[alt=thumbnail]").length'));
  if (before !== 0) return {status:'blocked',reason:'inputs_not_empty_avoid_mixed_photos',before};
  // Multi-view upload must be one atomic selection of 1–5 files in the
  // actual Creator <input multiple>. Chrome's file input setter dispatches
  // its change event; React processes images asynchronously (up to ~30 s).
  // Never manually re-fire onChange as this can duplicate thumbnail cards.
  const selector = 'div.rodin-homepage-upload-wrapper input[type=file][multiple]';
  if (typeof h.cdp === 'function') {
    const root=await h.cdp('DOM.getDocument',{depth:-1});
    const {nodeId}=await h.cdp('DOM.querySelector',{nodeId:root.root.nodeId,selector});
    if(!nodeId) throw Error('Creator multiview file input missing');
    await h.cdp('DOM.setFileInputFiles',{nodeId,files:resolved});
  } else if(resolved.length===1) {
    await h.upload_file(selector,resolved[0]);
  } else {
    return {status:'blocked',reason:'multi_file_selection_unavailable'};
  }
  let after;
  for(let i=0;i<35;i++) {
    after=parseDOM(await h.js(`(() => ({
      count:document.querySelectorAll('.rodin-homepage-upload-strip img[alt="thumbnail"]').length,
      fileInputCount:document.querySelector('.rodin-homepage-upload-wrapper input[type="file"]')?.files?.length||0,
      hasManualGenerate:!!document.querySelector('.newrodin_generateBtn__cTxM7')
    }))()`));
    if(after?.count===resolved.length && after?.hasManualGenerate)break;
    if(i<34) await h.sleep?.(500);
  }
  if (after?.count !== resolved.length || !after?.hasManualGenerate) {
    return {status:'blocked',reason:'browser_did_not_accept_reference',
      file_input_selected:after?.fileInputCount||0,thumbnail_count:after?.count||0,
      submitted:false,billed:false};
  }
  return {status:'reference_ready',count:after.count,submitted:false,billed:false,
    direction_labels_verified:false,note:'Image order is verified; direction menu labels are not yet verified.'};
}
