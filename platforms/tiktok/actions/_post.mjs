import { sleep } from "../../_action_helpers.mjs";
import inspect from "./_inspect.mjs";
import monitor from "./_monitor.mjs";
import { assertPublishAuthorized, assertNoObservedDuplicate, unverifiedReceipt, assertUploadMediaHash } from "../../_publish_guard.mjs";
export default async function post(
  { config: c, helpers: h, log = console.log },
) {
  const scope = assertPublishAuthorized(c, "tiktok");
  assertUploadMediaHash(c);
  const account = await inspect({ helpers: h, config: { expected_handle: scope.destination_account } });
  if (account.status !== "ready") throw new Error("destination_account_unverified:" + (account.reason || account.status));
  const inventory = await monitor({ helpers: h, config: {
    mode: "posts", expected_handle: scope.destination_account
  } });
  assertNoObservedDuplicate(inventory, c.caption, { platform: "tiktok", expected_account: scope.destination_account });
  let step = 0;
  const next = (s) => log(`[${++step}/7] ${s}`);
  next("Opening TikTok upload page...");
  await h.goto_url("https://www.tiktok.com/creator#/upload?scene=creator_center");
  await h.wait_for_load();
  await sleep(5000);
  let url = (await h.page_info()).url;
  if (
    /login|accounts/i.test(url) ||
    await h.js(
      '!!document.querySelector("[class*=login-modal],[class*=LoginModal]")',
    )
  ) {
    await h.capture_screenshot();
    throw new Error("Not logged in. Log in at tiktok.com first.");
  }
  const found = await h.wait_for_element(
    "input[type=file],input[accept*=video],[class*=upload-btn],[class*=upload-card]",
    { timeout: 30, visible: true },
  );
  if (!found) {
    await h.capture_screenshot();
    throw new Error("Upload area not found. May not be logged in.");
  }
  next("Uploading video: " + c.video);
  // Media integrity failure is never an upload transport error. Keep this
  // outside the upload fallback catch so a changed file cannot reach CDP.
  assertUploadMediaHash(c);
  try {
    await h.upload_file("input[type=file]", c.video);
  } catch {
    const s = await h.cdp("DOM.performSearch", { query: 'input[type="file"]' });
    if (!s.resultCount) throw new Error("Cannot find file input.");
    const n = await h.cdp("DOM.getSearchResults", {
      searchId: s.searchId,
      fromIndex: 0,
      toIndex: 1,
    });
    // The native upload may have failed after the file changed. Recheck
    // before CDP fallback; failures must escape rather than retry blindly.
    assertUploadMediaHash(c);
    await h.cdp("DOM.setFileInputFiles", {
      files: [c.video],
      nodeId: n.nodeIds[0],
    });
    await h.cdp("DOM.discardSearchResults", { searchId: s.searchId });
  }
  next("Waiting for video upload + processing...");
  let done = false;
  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    done = await h.js(
      `(()=>{const es=document.querySelectorAll('[class*=progress],[class*=percent],[class*=upload-progress]');for(const e of es){const t=e.textContent;if(t&&/100|Complete|Done/.test(t))return true}return false})()`,
    );
    if (done) break;
    if (i % 6 === 5) {
      log(
        "  -> Uploading... " +
          (await h.js(
            'document.querySelector("[class*=progress-text],[class*=percent]")?.textContent.trim()||"..."',
          )) + ` (${(i + 1) * 5}s)`,
      );
    }
  }
  if (!done) {
    await h.capture_screenshot();
    throw new Error("upload_processing_unverified: manual reconciliation required");
  }
  await sleep(3000);
  next("Setting caption...");
  const caption = c.caption;
  const captionSet = await h.js(
    `(()=>{let e=document.querySelector('[class*=caption-editor] [contenteditable],[class*=notranslate][contenteditable],[data-text=true],.DraftEditor-root [contenteditable],[class*=editor-container] [contenteditable]')||document.querySelector('[contenteditable=true]');if(e){e.focus();e.textContent=${
      JSON.stringify(caption)
    };e.dispatchEvent(new Event('input',{bubbles:true}));return true}return false})()`,
  );
  if (!captionSet) throw new Error("caption_not_applied");
  await sleep(1000);
  if (scope.visibility !== "public") {
    next("Setting visibility to " + scope.visibility + "...");
    const visibilityMenuOpened = await h.js(
      `(()=>{for(const e of document.querySelectorAll('[class*=select],[class*=dropdown],[class*=visibility]'))if(/Everyone|Public|Friends/.test(e.textContent)){e.click();return true}return false})()`,
    );
    await sleep(1000);
    if (!visibilityMenuOpened) throw new Error("visibility_menu_not_opened");
    const label = { friends: "Friends", private: "Only me" }[scope.visibility] ||
      "Everyone";
    const visibilitySet = await h.js(
      `(()=>{for(const e of document.querySelectorAll('[class*=option],[class*=menu-item],[role=option]'))if(e.textContent.includes(${
        JSON.stringify(label)
      })){e.click();return true}return false})()`,
    );
    if (!visibilitySet) throw new Error("visibility_not_applied");
    await sleep(1000);
  } else next("Visibility: public (default)");
  const changed = [];
  for (
    const [key, label] of [["allow_comments", "comments"], [
      "allow_duets",
      "duets",
    ], ["allow_stitch", "stitch"]]
  ) if (c[key] === false) changed.push(label + " off");
  if (changed.length) {
    next("Adjusting toggles: " + changed.join(", "));
    await h.js(
      `(()=>{const labels=['comment','duet','stitch'],states=${
        JSON.stringify([
          c.allow_comments ?? true,
          c.allow_duets ?? true,
          c.allow_stitch ?? true,
        ])
      };for(const t of document.querySelectorAll('[class*=toggle],[class*=switch]')){const text=(t.closest('[class*=form-item],[class*=setting]')||t.parentElement).textContent.toLowerCase();labels.forEach((label,i)=>{if(text.includes(label)){const on=t.classList.contains('on')||t.getAttribute('aria-checked')==='true'||!!t.querySelector('[class*=active]');if(on!==states[i])t.click()}})}})()`,
    );
    await sleep(1000);
  } else next("Social features: defaults (all enabled)");
  await h.capture_screenshot();
  next("Posting video...");
  const clicked = await h.js(
    `(()=>{for(const b of document.querySelectorAll('button,[class*=btn-post],[class*=post-button]'))if(['Post','发布'].includes(b.textContent.trim())){b.click();return true}return false})()`,
  );
  if (!clicked) {
    throw new Error("Post button not found; no submission was made");
  }
  await sleep(5000);
  await h.capture_screenshot();
  log("TikTok Post click submitted; verify real post URL and visibility before claiming success.");
  return unverifiedReceipt(scope, { submission_page_url: (await h.page_info()).url });
}
