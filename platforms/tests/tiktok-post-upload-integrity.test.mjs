import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tiktokPost from "../tiktok/actions/_post.mjs";
import youtubePost from "../youtube/actions/_post.mjs";

function fixture(t, { changeOnUploadPage = false, nativeUploadFailure = false,
  changeAfterNativeFailure = false, draftsVerified = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "tiktok-post-mock-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const video = join(dir, "synthetic-video.mp4");
  const initialBytes = Buffer.from("synthetic original media, not a real video");
  writeFileSync(video, initialBytes);
  const video_sha256 = createHash("sha256").update(initialBytes).digest("hex");
  const stats = { nativeUploads: 0, cdpCalls: [], uploadPageVisited: false,
    mutated: false, monitorVisited: false };
  let url = "";
  const mutate = () => {
    writeFileSync(video, "mutated media bytes AFTER initial validation");
    stats.mutated = true;
  };
  const helpers = {
    goto_url: async next => {
      url = next;
      if (next.includes("/tiktokstudio/content")) stats.monitorVisited = true;
      if (next.includes("/creator#/upload")) {
        stats.uploadPageVisited = true;
        if (changeOnUploadPage) mutate();
      }
    },
    wait_for_load: async () => {},
    page_info: async () => ({ url }),
    js: async script => {
      if (script.includes("const seen = new Set()"))
        return { posts: [], empty: true, draft_inventory: draftsVerified ? {
          status: "verified_empty", account: "lalalic001",
          observed_at: new Date().toISOString(),
          source_url: "https://www.tiktok.com/tiktokstudio/content",
          all_pages_exhausted: true, total_items: 0,
          checked_states: ["drafts","scheduled","processing","failed","hidden"]
        } : undefined };
      if (script.includes("handle =") && script.includes("upload"))
        return { handle: "lalalic001", upload: true };
      if (script.includes("login-modal")) return false;
      throw new Error("unexpected_browser_js_in_mock");
    },
    wait_for_element: async () => true,
    wait: async () => {},
    upload_file: async () => {
      stats.nativeUploads++;
      if (nativeUploadFailure) throw new Error("synthetic_browser_native_upload_error");
      // Abort deliberately before a real upload/long processing path.
      throw new Error("native_mock_not_expected_to_succeed");
    },
    cdp: async (method) => {
      stats.cdpCalls.push(method);
      if (method === "DOM.performSearch") return { resultCount: 1, searchId: "synthetic" };
      if (method === "DOM.getSearchResults") {
        if (changeAfterNativeFailure) mutate();
        return { nodeIds: [100] };
      }
      if (method === "DOM.setFileInputFiles") throw new Error("MOCK_FALLBACK_REACHED");
      if (method === "DOM.discardSearchResults") return {};
      throw new Error("unexpected_cdp_method");
    }
  };
  const config = {
    confirm_publish: true, publication_attempt_id: "mock-attempt-1",
    video, video_sha256, expected_account: "lalalic001",
    visibility: "private", caption: "synthetic test, no upload"
  };
  return { config, helpers, stats };
}

test("actual TikTok Action refuses a verified empty post list when drafts are not verified", async t => {
  const { config, helpers, stats } = fixture(t, { draftsVerified: false });
  await assert.rejects(
    tiktokPost({config, helpers, log: () => {}}),
    /prepublish_draft_inventory_unverified/
  );
  assert.equal(stats.monitorVisited, true, "must inspect real post inventory first");
  assert.equal(stats.uploadPageVisited, false, "must not navigate to upload");
  assert.equal(stats.nativeUploads, 0, "must not upload");
  assert.deepEqual(stats.cdpCalls, [], "must not attempt fallback");
});

test("actual TikTok Action rejects changed bytes between initial and pre-upload checks without CDP fallback", async t => {
  const { config, helpers, stats } = fixture(t, { changeOnUploadPage: true });
  await assert.rejects(
    tiktokPost({ config, helpers, log: () => {} }),
    /upload_media_hash_mismatch/
  );
  assert.equal(stats.monitorVisited, true, "mock reached real monitor action");
  assert.equal(stats.uploadPageVisited, true, "mock reached real post upload page");
  assert.equal(stats.mutated, true);
  assert.equal(stats.nativeUploads, 0, "native upload must not run");
  assert.deepEqual(stats.cdpCalls, [], "CDP fallback must not run");
});

test("actual TikTok Action blocks changed bytes even when native browser upload fails first", async t => {
  const { config, helpers, stats } = fixture(t, {
    nativeUploadFailure: true, changeAfterNativeFailure: true
  });
  await assert.rejects(
    tiktokPost({ config, helpers, log: () => {} }),
    /upload_media_hash_mismatch/
  );
  assert.equal(stats.nativeUploads, 1);
  assert.equal(stats.mutated, true);
  assert.equal(stats.cdpCalls.includes("DOM.setFileInputFiles"), false,
    "changed bytes must never reach fallback file input");
});

test("actual TikTok Action fallback remains limited to browser upload failure with matching bytes", async t => {
  const { config, helpers, stats } = fixture(t, {
    nativeUploadFailure: true
  });
  await assert.rejects(
    tiktokPost({ config, helpers, log: () => {} }),
    /MOCK_FALLBACK_REACHED/
  );
  assert.equal(stats.nativeUploads, 1);
  assert.equal(stats.mutated, false);
  assert.equal(stats.cdpCalls.includes("DOM.setFileInputFiles"), true,
    "mock proves fallback is only entered after native upload exception");
});


test("unavailable Worknode-staged bytes fail before any browser action on either platform", async t => {
  const { config } = fixture(t);
  const nonexistent = join(tmpdir(), "nonexistent-master-only-path-for-test.mp4");
  for (const [action,platform] of [[tiktokPost,"tiktok"],[youtubePost,"youtube"]]) {
    let browserCalls = 0;
    const helpers = new Proxy({}, { get() { browserCalls++; return async () => {}; } });
    await assert.rejects(action({
      config: {...config,video:nonexistent,expected_account:platform==="youtube"?"UCOoJX2s21KrOcRE0B46vx6g":"lalalic001",
        title:"synthetic title", visibility:"private"},
      helpers, log:()=>{}
    }), /upload_media_unreadable/);
    assert.equal(browserCalls,0);
  }
});
