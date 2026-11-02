import test from "node:test";
import assert from "node:assert/strict";
import { assertPublishAuthorized, assertNoObservedDuplicate, unverifiedReceipt } from "../_publish_guard.mjs";
import postTikTok from "../tiktok/actions/_post.mjs";
import postYoutube from "../youtube/actions/_post.mjs";

const approved = (platform = "tiktok") => ({
  video: "/private/episode/revision-3.mp4",
  caption: "Episode promotion caption",
  title: "Episode promotion title",
  confirm_publish: true,
  provider_id: "non-affiliate",
  publication_attempt_id: "run-1/tiktok/attempt-1",
  visibility: platform === "youtube" ? "PRIVATE" : "public",
  approval: {
    owner_approved: true, rights_verified: true,
    approval_ref: "private/owner-approval.json",
    creative_revision_id: "rev-3",
    video_path: "/private/episode/revision-3.mp4",
    account_id: platform === "youtube" ? "youtube-primary" : "tiktok-primary",
    expected_account: platform === "youtube" ? "UCOoJX2s21KrOcRE0B46vx6g" : "lalalic001",
    visibility: platform === "youtube" ? "PRIVATE" : "public",
    link_placement: "profile"
  }
});

test("a confirm_publish boolean alone cannot open or upload anything", async () => {
  for (const post of [postTikTok, postYoutube]) {
    let browserOps = 0;
    await assert.rejects(post({
      config: { confirm_publish:true, provider_id:"non-affiliate", video:"/tmp/file.mp4" },
      helpers: new Proxy({}, {get: () => () => { browserOps++; }}),
      log: () => {}
    }), /publication_approval_unverified/);
    assert.equal(browserOps, 0);
  }
});
test("publication scope binds account, revision, media path and visibility", () => {
  assert.equal(assertPublishAuthorized(approved(), "tiktok").creative_revision_id, "rev-3");
  const m = approved(); m.video="/tmp/other.mp4";
  assert.throws(() => assertPublishAuthorized(m, "tiktok"), /approved_video_mismatch/);
  const v = approved("youtube"); v.vis = "PUBLIC";
  assert.throws(() => assertPublishAuthorized(v, "youtube"), /approved_visibility_mismatch/);
  const id = approved(); id.publication_attempt_id="";
  assert.throws(() => assertPublishAuthorized(id, "tiktok"), /publication_attempt_id_required/);
});
test("RS Boost must have affirmative Safelist, rights and series link evidence", () => {
  const c=approved(); c.provider_id="rs-boost";
  assert.throws(() => assertPublishAuthorized(c,"tiktok"), /rsboost_rights_safelist_or_link_unverified/);
  c.approval.safelist_status="Pending Update";
  c.approval.episode_rights_ref="private/rights";
  c.approval.content_promotion_link_ref="private/link";
  assert.throws(() => assertPublishAuthorized(c,"tiktok"), /rsboost_rights_safelist_or_link_unverified/);
  c.approval.safelist_status="approved";
  c.approval.approved_link_placement_ref="private/link-placement";
  assert.equal(assertPublishAuthorized(c,"tiktok").account_id, "tiktok-primary");
});
test("previous ambiguous attempt is never retried without manual reconciliation", () => {
  const c=approved(); c.retry_of="run-1/tiktok/attempt-0";
  assert.throws(() => assertPublishAuthorized(c,"tiktok"), /manual_reconciliation/);
  const r=unverifiedReceipt(assertPublishAuthorized(approved(),"tiktok"), {submission_page_url:"https://www.tiktok.com/creator"});
  assert.equal(r.status,"submitted_unverified");
  assert.equal(r.post_url,null);
  assert.equal(r.post_id,null);
  assert.equal(r.never_auto_retry,true);
});
test("incorrect authenticated account fails before upload", async () => {
  for (const [post, platform] of [[postTikTok,"tiktok"],[postYoutube,"youtube"]]) {
    let uploads=0;
    const helpers={
      goto_url:async()=>{}, wait_for_load:async()=>{},
      page_info:async()=>({url:platform==="tiktok"?"https://www.tiktok.com/tiktokstudio":"https://studio.youtube.com/channel/UCother"}),
      js:async()=>({handle:"other-person",upload:true}),
      upload_file:async()=>{uploads++;}
    };
    await assert.rejects(post({config:approved(platform),helpers,log:()=>{}}), /destination_account_unverified/);
    assert.equal(uploads,0);
  }
});

test("duplicate probe stops on unresolved inventory and matches actual posted content", () => {
  assert.throws(() => assertNoObservedDuplicate({status:"unverified",posts:[]}, "caption"), /inventory_unverified/);
  assert.throws(() => assertNoObservedDuplicate({status:"ok",posts:[{summary:"the SAME Caption used"}]}, "same caption"), /possible_duplicate_post/);
  assert.equal(assertNoObservedDuplicate({status:"ok",posts:[{summary:"different content"}]}, "new caption").checked_count, 1);
});
test("RS Boost cannot use unclickable Shorts description as approved placement", () => {
  const c=approved("youtube"); c.provider_id="rs-boost";
  Object.assign(c.approval, {safelist_status:"approved", episode_rights_ref:"private/episode-rights",content_promotion_link_ref:"private/link",approved_link_placement_ref:"private/link-placement",link_placement:"description"});
  assert.throws(()=> assertPublishAuthorized(c,"youtube"),/rsboost_rights_safelist_or_link_unverified/);
  c.approval.link_placement="profile";
  assert.equal(assertPublishAuthorized(c,"youtube").account_id, "youtube-primary");
});

test("provider identity cannot be omitted to bypass RS Boost gate", () => {
  const c=approved(); delete c.provider_id;
  assert.throws(()=>assertPublishAuthorized(c,"tiktok"),/provider_id_required/);
});
