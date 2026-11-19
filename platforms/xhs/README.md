---
name: xhs-platform
description: "Xiaohongshu Browser Workspace posting and creator-manager assets."
---

# Xiaohongshu

Use the parent Browser Workspace skill contract first. The
`actions/` directory contains the canonical migrated mechanics used by
`skills/post`; posting-domain validation and publish semantics remain in `post`.


## Read-only research (`research` Action)

Use `webhelm platform run xhs research --session-id SESSION_ID --config /path/to/options.json` in an **owned** signed-in browser Session. This is separate from creator `manage`: it reads **my saved posts** (not my posts or likes) and can retrieve a specific saved post by `note_id` or `note_url`. Never writes comments, changes likes/saves, or posts.

Example `options.json`: `{"operation":"collections","scan_limit":20,"min_comments_exclusive":1000,"comment_limit":50}`; `operation:"post"` requires `note_id` or `note_url`. For a single post, `scan_limit` is only used for initial collection discovery. If a post is not in the loaded 60 collection cards, the action returns `not_found` instead of assuming it is absent from all saved posts.

The result distinguishes three engagement metrics: `likes`, `saves`, and **comments**. A confirmed comments metric comes only from the detail page's labelled `共 N 条评论`, not the card's like count or the number of loaded comments. `raw` is preserved and approximate Chinese/K suffixes are identified. When detail data is loading, blocked, or unavailable, the action returns a specific blocker and does not set comment count to zero or declare qualification. Sampled comment texts and reply flags are read from visible DOM only, without claiming exhaustive or unbiased coverage. Never store comment text in Git or expose access tokens. No publication authorization is inferred.

### Full post research / video speech transcription

The ChatGPT command **`research <XHS post>`** is a higher-level *workflow*, not an alias for this single WebHelm Action. It should use `xhs research` for signed-in page metadata, **post正文**, comment count, collection/like totals, and visible comment replies, then inspect actual video media and invoke **Work Node** STT/Whisper for the video audio as a separate processing step. Do not describe UI captions or webpage text as STT. This read-only browser Action itself **does not transcribe audio** or store/download videos; its `media` field identifies a playable XHS video (when visible), duration if available, and `stt.status=not_transcribed` with next-step guidance. When the calling workflow can securely transfer the authorized video source to Work Node, it can explicitly request `include_media_url:true` (the result then contains a potentially signed, time-limited media URL: keep it private, never commit it or log it). The end-to-end ChatGPT response should combine observed post metadata, video/audio transcript with timestamps, frames/scene cues where obtained, and uncertainties; do not claim an STT transcript until actually produced.
