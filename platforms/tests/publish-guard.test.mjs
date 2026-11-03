import test from "node:test";
import assert from "node:assert/strict";
import { assertPublishAuthorized, assertNoObservedDuplicate, unverifiedReceipt } from "../_publish_guard.mjs";
import postTikTok from "../tiktok/actions/_post.mjs";
import postYoutube from "../youtube/actions/_post.mjs";

const config = (platform = "tiktok") => ({
  confirm_publish: true, video: "/private/episode/revision-3.mp4",
  caption: "Episode promotion caption", title: "Episode promotion title",
  publication_attempt_id: "attempt-1",
  expected_account: platform === "youtube" ? "UCOoJX2s21KrOcRE0B46vx6g" : "lalalic001",
  visibility: platform === "youtube" ? "PRIVATE" : "public"
});
const inv = (platform="tiktok", overrides={}) => ({
  status:"ok", posts:[], empty_state_verified:true,
  draft_inventory:{status:"verified_empty",account:config(platform).expected_account,
    source_url:platform==="tiktok"?"https://www.tiktok.com/tiktokstudio/content":"https://studio.youtube.com/channel/UCOoJX2s21KrOcRE0B46vx6g/videos/short",
    observed_at:new Date().toISOString(), all_pages_exhausted:true, total_items:0,
    checked_states:["drafts","scheduled","processing","failed","hidden"]},
  observed_at:new Date().toISOString(),
  source_url:platform==="tiktok"
    ? "https://www.tiktok.com/tiktokstudio/content"
    : "https://studio.youtube.com/channel/UCOoJX2s21KrOcRE0B46vx6g/videos/short",
  ...overrides
});
const check = (platform="tiktok", changes={}) => assertNoObservedDuplicate(
  inv(platform,changes), "new distinct caption", {
    platform, expected_account:config(platform).expected_account
  }
);

test("generic post requires explicit confirmation before any browser use", async () => {
  for (const post of [postTikTok,postYoutube]) {
    let browserOps=0;
    await assert.rejects(post({config:{...config(),confirm_publish:false},
      helpers:new Proxy({}, {get:()=>()=>{browserOps++;}}), log:()=>{}
    }), /confirm_publish_required/);
    assert.equal(browserOps,0);
  }
});
test("generic preflight validates only platform intent, not business claims", () => {
  const c=config();
  Object.assign(c,{provider_id:"anything",approval:{owner_approved:true,rights_verified:true,approval_ref:"nonexistent"},
    account_id:"wrong-account",link_placement:"description"});
  assert.equal(assertPublishAuthorized(c,"tiktok").destination_account,"lalalic001");
  assert.equal(assertPublishAuthorized({...c,provider_id:"rs-boost"},"tiktok").destination_account,"lalalic001");
  assert.equal(assertPublishAuthorized({...c,provider_id:"not-rs-boost"},"tiktok").destination_account,"lalalic001");
  assert.throws(()=>assertPublishAuthorized({...c,expected_account:""},"tiktok"), /expected_tiktok_identity_required/);
  assert.throws(()=>assertPublishAuthorized({...c,visibility:""},"tiktok"), /explicit_visibility_required/);
  assert.throws(()=>assertPublishAuthorized({...c,publication_attempt_id:""},"tiktok"), /publication_attempt_id_required/);
});
test("generic action blocks retries and does not claim publish success", () => {
  assert.throws(()=>assertPublishAuthorized({...config(),retry_of:"attempt-0"},"tiktok"),/manual_reconciliation/);
  const r=unverifiedReceipt(assertPublishAuthorized(config(),"tiktok"),{submission_page_url:"https://www.tiktok.com/creator"});
  assert.equal(r.status,"submitted_unverified"); assert.equal(r.post_id,null);
  assert.equal(r.never_auto_retry,true);
});
test("wrong live channel fails before upload", async () => {
  for(const [post,platform] of [[postTikTok,"tiktok"],[postYoutube,"youtube"]]) {
    let uploads=0;
    const helpers={goto_url:async()=>{},wait_for_load:async()=>{},
      page_info:async()=>({url:"https://studio.youtube.com/channel/UCwrong"}),
      js:async()=>({handle:"other",upload:true}),
      upload_file:async()=>{uploads++;}};
    await assert.rejects(post({config:config(platform),helpers,log:()=>{}}),/destination_account_unverified/);
    assert.equal(uploads,0);
  }
});
test("missing posts array fails closed, including status ok", () => {
  assert.throws(()=>check("tiktok",{posts:undefined}),/inventory_unverified/);
  assert.throws(()=>check("youtube",{posts:undefined}),/inventory_unverified/);
  assert.throws(()=>check("tiktok",{status:"unverified"}),/inventory_unverified/);
});
test("trusted origin and freshness are mandatory", () => {
  assert.throws(()=>check("tiktok",{source_url:"https://fake.example/tiktokstudio/content"}),/origin_unverified/);
  assert.throws(()=>check("youtube",{source_url:"https://studio.youtube.com/channel/UCwrong/videos/short"}),/origin_unverified/);
  assert.throws(()=>check("tiktok",{observed_at:null}),/stale_or_undated/);
  assert.throws(()=>check("tiktok",{observed_at:"2020-01-01T00:00:00Z"}),/stale_or_undated/);
});
test("verified empty inventory may pass; incomplete 30-row sample cannot", () => {
  assert.equal(check("tiktok").checked_count,0);
  assert.throws(()=>check("tiktok",{empty_state_verified:false}),/inventory_incomplete/);
  assert.throws(()=>check("tiktok",{posts:[{title:"other"}],empty_state_verified:false}),/inventory_incomplete/);
  assert.throws(()=>check("youtube",{posts:Array.from({length:30},(_,i)=>({title:"other"+i})),empty_state_verified:false}),/inventory_incomplete/);
  assert.throws(()=>check("youtube",{posts:[{title:"different"}],empty_state_verified:false,coverage_complete:true}),/inventory_incomplete/);
  assert.throws(()=>check("tiktok",{posts:[{title:"unrelated"}],empty_state_verified:true,coverage_complete:true}),/inventory_incomplete/);
});
test("empty published posts without independent draft inspection fail closed", () => {
  for (const platform of ["tiktok","youtube"]) {
    assert.throws(()=>check(platform,{draft_inventory:null}),/draft_inventory_unverified/);
    assert.throws(()=>check(platform,{draft_inventory:{status:"verified_empty"}}),/draft_inventory_unverified/);
    assert.throws(()=>check(platform,{draft_inventory:undefined,coverage_complete:true,
      drafts_empty:true,empty_state_verified:true}),/draft_inventory_unverified/);
  }
});
test("draft inspection must cover all states and the exact target", () => {
  const d=inv().draft_inventory;
  assert.throws(()=>check("tiktok",{draft_inventory:{...d,account:"other"}}),/draft_inventory_unverified/);
  assert.throws(()=>check("tiktok",{draft_inventory:{...d,checked_states:["drafts"]}}),/draft_inventory_unverified/);
  assert.throws(()=>check("tiktok",{draft_inventory:{...d,all_pages_exhausted:false}}),/draft_inventory_unverified/);
  assert.throws(()=>check("tiktok",{draft_inventory:{...d,total_items:1}}),/draft_inventory_unverified/);
  assert.throws(()=>check("tiktok",{draft_inventory:{...d,observed_at:"2020-01-01T00:00:00Z"}}),/draft_inventory_unverified/);
});

test("observed matching content is blocked even when inventory is complete", () => {
  assert.throws(()=>check("tiktok",{posts:[{summary:"the NEW DISTINCT CAPTION was here"}],coverage_complete:true}),/possible_duplicate_post/);
});
