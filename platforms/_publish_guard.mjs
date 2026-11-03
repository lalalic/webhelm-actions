import { URL } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export function assertPublishAuthorized(c, platform) {
  // Generic platform intent only. Business evidence must be verified upstream.
  if (c?.confirm_publish !== true) throw new Error("confirm_publish_required");
  if (typeof c.video !== "string" || !c.video.trim()) throw new Error("video_required");
  if (typeof c.publication_attempt_id !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(c.publication_attempt_id)) {
    throw new Error("publication_attempt_id_required");
  }
  if (c.retry_of || c.resume_attempt) throw new Error("previous_attempt_requires_manual_reconciliation");
  const expected = String(c.expected_account || "").trim().replace(/^@/, "");
  if (platform === "tiktok" && !/^[A-Za-z0-9_.]+$/.test(expected)) {
    throw new Error("expected_tiktok_identity_required");
  }
  if (platform === "youtube" && !/^UC[A-Za-z0-9_-]+$/.test(expected)) {
    throw new Error("expected_youtube_identity_required");
  }
  if (!["tiktok", "youtube"].includes(platform)) throw new Error("unsupported_platform");
  const visibility = String(c.visibility || "").toLowerCase();
  const allowed = platform === "tiktok" ? ["public","friends","private"] : ["public","unlisted","private"];
  if (!allowed.includes(visibility)) throw new Error("explicit_visibility_required");
  if (platform === "tiktok" && (typeof c.caption !== "string" || !c.caption.trim())) {
    throw new Error("caption_required");
  }
  if (platform === "youtube" && (typeof c.title !== "string" || !c.title.trim())) {
    throw new Error("title_required");
  }
  return {
    publication_attempt_id: c.publication_attempt_id,
    requested_revision_id: String(c.creative_revision_id || "").trim() || null,
    destination_account: expected,
    visibility
  };
}

export function assertUploadMediaHash(c) {
  // Optional generic transport-integrity recheck. The project remains
  // responsible for authentic release approval and the signed expected hash.
  if (c.video_sha256 === undefined) return;
  if (typeof c.video_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(c.video_sha256))
    throw new Error("invalid_expected_media_hash");
  let digest;
  try { digest = createHash("sha256").update(readFileSync(c.video)).digest("hex"); }
  catch { throw new Error("upload_media_unreadable"); }
  if (digest !== c.video_sha256) throw new Error("upload_media_hash_mismatch");
}
export function unverifiedReceipt(scope, evidence = {}) {
  return {
    ...evidence,
    status: "submitted_unverified",
    publication_attempt_id: scope.publication_attempt_id,
    requested_revision_id: scope.requested_revision_id,
    observed_destination_account: scope.destination_account,
    requested_visibility: scope.visibility,
    observed_at: new Date().toISOString(),
    post_id: null,
    post_url: null,
    requires_manual_reconciliation: true,
    never_auto_retry: true
  };
}

export function assertNoObservedDuplicate(inventory, text, {
  platform, expected_account, now = Date.now()
} = {}) {
  if (inventory?.status !== "ok" || !Array.isArray(inventory.posts)) {
    throw new Error("prepublish_inventory_unverified: posts list or status missing");
  }
  if (typeof text !== "string" || !text.trim()) throw new Error("duplicate_marker_unverified");
  if (!["youtube","tiktok"].includes(platform) || !expected_account) {
    throw new Error("prepublish_inventory_origin_unverified");
  }
  let u;
  try { u = new URL(inventory.source_url); } catch {
    throw new Error("prepublish_inventory_origin_unverified");
  }
  const host = platform === "tiktok" ? "www.tiktok.com" : "studio.youtube.com";
  const expectedPath = platform === "tiktok"
    ? "/tiktokstudio/content"
    : "/channel/" + expected_account + "/videos/";
  if (u.protocol !== "https:" || u.hostname !== host ||
      !u.pathname.startsWith(expectedPath) || u.username || u.password) {
    throw new Error("prepublish_inventory_origin_unverified");
  }
  const age = now - Date.parse(inventory.observed_at);
  if (!Number.isFinite(age) || age < -30000 || age > 120000) {
    throw new Error("prepublish_inventory_stale_or_undated");
  }
  const needle = text.trim().slice(0,120).toLocaleLowerCase();
  if (inventory.posts.some(p => String(p?.summary || p?.title || "").toLocaleLowerCase().includes(needle))) {
    throw new Error("possible_duplicate_post: manual reconciliation required");
  }
  // The current monitor samples at most 30 rows. Caller-injected
  // coverage_complete is never credible evidence of complete history.
  // Until a platform monitor has a verifiable paginated end-of-list
  // implementation, nonempty lists always require manual reconciliation.
  if (inventory.posts.length > 0 || inventory.empty_state_verified !== true) {
    throw new Error("prepublish_inventory_incomplete: manual reconciliation required");
  }
  // An empty published-post list says nothing about drafts, scheduled,
  // processing, hidden or failed uploads. The current monitors do not
  // supply a verified all-state inventory, so automated posting stays HOLD.
  // A future monitor must generate this evidence from its own authenticated
  // UI inspection; caller config flags are never consulted.
  const draft = inventory.draft_inventory;
  const states = ["drafts", "scheduled", "processing", "failed", "hidden"];
  if (draft?.status !== "verified_empty" ||
      draft.account !== expected_account ||
      draft.all_pages_exhausted !== true ||
      draft.total_items !== 0 ||
      !Array.isArray(draft.checked_states) ||
      !states.every(state => draft.checked_states.includes(state))) {
    throw new Error("prepublish_draft_inventory_unverified: manual reconciliation required");
  }
  let draftUrl;
  try { draftUrl = new URL(draft.source_url); } catch {
    throw new Error("prepublish_draft_inventory_unverified");
  }
  const draftAge = now - Date.parse(draft.observed_at);
  if (draftUrl.protocol !== "https:" || draftUrl.hostname !== host ||
      !draftUrl.pathname.startsWith(platform === "tiktok" ? "/tiktokstudio/" : "/channel/" + expected_account + "/") ||
      draftUrl.username || draftUrl.password ||
      !Number.isFinite(draftAge) || draftAge < -30000 || draftAge > 120000) {
    throw new Error("prepublish_draft_inventory_unverified");
  }
  return { checked_count: inventory.posts.length, source_url: inventory.source_url };
}
