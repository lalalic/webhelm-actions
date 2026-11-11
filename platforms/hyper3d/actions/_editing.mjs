import {requireWorkspace, parseDOM} from './_workspace.mjs';
/** Read-only discovery of visible Rodin 3D Editing controls.
 * Switches UI tab; never uploads, submits or confirms.
 */
export default async function editing({helpers:h}) {
  await requireWorkspace(h);
  const switched=parseDOM(await h.js(`(() => {
    const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='3D Editing');
    if(!b)return false;
    b.click();return true;
  })()`));
  if(!switched) return {status:'blocked',reason:'editing_ui_unavailable'};
  const observed=parseDOM(await h.js(`(() => {
    const text=document.body.innerText;
    const start=text.indexOf('3D Editing\\nUpload custom reference image');
    const excerpt=start>=0 ? text.slice(start,start+390) : '';
    const formats=excerpt.includes('Supports') ?
      (excerpt.match(/\\.(?:obj|fbx|glb)/g)||[]) : [];
    return {
      parts:/\\bParts\\b/.test(excerpt),refine:/\\bRefine\\b/.test(excerpt),
      modify:/\\bModify\\b/.test(excerpt),
      preview_text:excerpt.includes('Free Preview')?'Free Preview':null,
      visible_formats:[...new Set(formats)],
      mode_available:start>=0,
    };
  })()`));
  if(!observed?.mode_available) return {status:'blocked',reason:'editing_controls_not_visible'};
  return {status:'ready',source:'visible_creator_dom',...observed,
    note:'The advertised free preview is not proof that confirmation, BANG, refinement or texture download costs zero credits.',
    submitted:false,billed:false};
}
