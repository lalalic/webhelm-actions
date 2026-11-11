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
  const resolved = files.map(f=>path.resolve(f));
  for (const file of resolved) {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size<100 || stat.size>10*1024*1024) throw Error('Reference image invalid or too large');
  }
  const before = parseDOM(await h.js('document.querySelectorAll(".rodin-homepage-upload-strip img[alt=thumbnail]").length'));
  if (before !== 0) return {status:'blocked',reason:'inputs_not_empty_avoid_mixed_photos',before};
  // Avoid multiple-image upload until WebHelm supports multi-file assignment
  // with atomic validation. No misleading receipt for 2–5 image requests.
  if (resolved.length !== 1) return {status:'blocked',reason:'multi_file_upload_not_verified'};
  await h.upload_file('div.rodin-homepage-upload-wrapper input[type=file]',resolved[0]);
  const after = parseDOM(await h.js(`(() => ({
    count:document.querySelectorAll('.rodin-homepage-upload-strip img[alt="thumbnail"]').length,
    ready:!!document.querySelector('button[aria-label="GENERATE"]:not([disabled])'),
    fileInputCount:document.querySelector('.rodin-homepage-upload-wrapper input[type="file"]')?.files?.length||0
  }))()`));
  if (!after?.count || !after.ready) {
    return {status:'blocked',reason:'browser_did_not_accept_reference',
      file_input_selected:after?.fileInputCount||0,thumbnail_count:after?.count||0,
      submitted:false,billed:false};
  }
  return {status:'reference_ready',count:after.count,submitted:false,billed:false};
}
