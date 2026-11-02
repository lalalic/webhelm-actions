export function assertPublishAuthorized(c, platform) {
  if (c?.confirm_publish !== true) {
    throw new Error("Explicit confirm_publish:true and owner publication approval are required before upload");
  }
  if (typeof c.provider_id !== "string" || !c.provider_id.trim()) throw new Error("provider_id_required");
  const a = c.approval;
  if (!a || a.owner_approved !== true || a.rights_verified !== true) {
    throw new Error("publication_approval_unverified");
  }
  for (const key of ["approval_ref", "creative_revision_id", "video_path",
    "account_id", "expected_account", "visibility", "link_placement"]) {
    if (typeof a[key] !== "string" || !a[key].trim()) {
      throw new Error("publication_approval_unverified: " + key);
    }
  }
  if (c.vis && String(c.vis).toLowerCase() !== a.visibility.toLowerCase()) throw new Error("approved_visibility_mismatch");
  if (!c.video || c.video !== a.video_path) throw new Error("approved_video_mismatch");
  const visibility = String(c.visibility || (platform === "youtube" ? "PRIVATE" : "public")).toLowerCase();
  if (a.visibility.toLowerCase() !== visibility) throw new Error("approved_visibility_mismatch");
  if (typeof c.publication_attempt_id !== "string" || !c.publication_attempt_id.trim()) {
    throw new Error("publication_attempt_id_required");
  }
  if (c.retry_of || c.resume_attempt) {
    throw new Error("previous_attempt_requires_manual_reconciliation");
  }
  if (c.provider_id === "rs-boost" &&
      (a.safelist_status !== "approved" ||
       a.link_placement !== "profile" ||
       typeof a.approved_link_placement_ref !== "string" || !a.approved_link_placement_ref ||
       typeof a.episode_rights_ref !== "string" || !a.episode_rights_ref ||
       typeof a.content_promotion_link_ref !== "string" || !a.content_promotion_link_ref)) {
    throw new Error("rsboost_rights_safelist_or_link_unverified");
  }
  if (platform === "tiktok" && (typeof c.caption !== "string" || !c.caption.trim())) throw new Error("caption_required");
  if (platform === "youtube" && (typeof c.title !== "string" || !c.title.trim())) throw new Error("title_required");
  if (platform === "tiktok" && !/^[A-Za-z0-9_.]+$/.test(a.expected_account.replace(/^@/, ""))) {
    throw new Error("expected_tiktok_identity_invalid");
  }
  if (platform === "youtube" && !/^UC[A-Za-z0-9_-]+$/.test(a.expected_account)) {
    throw new Error("expected_youtube_identity_invalid");
  }
  return {
    publication_attempt_id: c.publication_attempt_id,
    creative_revision_id: a.creative_revision_id,
    account_id: a.account_id,
    destination_account: a.expected_account,
    visibility
  };
}
export function unverifiedReceipt(scope, evidence = {}) {
  return {
    status: "submitted_unverified",
    publication_attempt_id: scope.publication_attempt_id,
    creative_revision_id: scope.creative_revision_id,
    account_id: scope.account_id,
    destination_account: scope.destination_account,
    requested_visibility: scope.visibility,
    observed_at: new Date().toISOString(),
    post_id: null,
    post_url: null,
    requires_manual_reconciliation: true,
    never_auto_retry: true,
    ...evidence
  };
}

export function assertNoObservedDuplicate(inventory, text) {
  if (inventory?.status !== "ok") {
    throw new Error("prepublish_inventory_unverified: manual reconciliation required");
  }
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("duplicate_marker_unverified");
  }
  const needle = text.trim().slice(0, 120).toLocaleLowerCase();
  if (inventory.posts?.some(p => String(p.summary || p.title || "").toLocaleLowerCase().includes(needle))) {
    throw new Error("possible_duplicate_post: manual reconciliation required");
  }
  return { checked_count: inventory.posts?.length || 0, source_url: inventory.source_url || null };
}
