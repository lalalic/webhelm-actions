# Hyper3D Rodin Creator — WebHelm Actions

This is an authenticated **website Creator workflow**, not the separate API-key tier. All browser interactions use an owned WebHelm Session. The Actions never read or return user email, cookies, tokens or private photo contents.

## Supported Actions

- `inspect`: read-only current workspace state and visible task indicators; not a complete task history.
- `assets`: navigates to Mine and lists only visible task cards (IDs, stage, busy flag). An empty DOM is reported as `empty_or_unloaded`, **not** a claim that no assets exist.
- `configure` `{"effort":"High","agentic":false}`: nonbillable Gen-2.5 selection and optional Agentic off. Confirms actual selected UI. Permitted efforts: Extreme-Low, Low, Medium, High, Extreme-High.
- `references` `{"files":["/absolute/path/photo.jpg"]}`: attempts one already prepared upright photo through the website uploader, then **requires** a real thumbnail and enabled Generate before returning `reference_ready`. If frontend rejects the image silently, returns `blocked` and never submits. Multiple-file upload is not yet verified and is rejected conservatively.
- `editing`: visits 3D Editing within the same workspace and reports actually visible Parts / Refine / Modify / Free Preview / accepted file formats. Does not submit or upload.

Run with `webhelm platform run hyper3d ACTION --session-id SESSION --config /path/to/config.json`, after `webhelm session start --url https://hyper3d.ai/workspace/rodin`, and always `webhelm session stop` when done.

## Website findings / failure modes (2026-11-11)

- Signed-in Creator can select Gen-2.5 High and Extreme-High in the browser, while Creator **Basic API** key remains limited to Gen-2.5 Low/Extreme-Low. Official support says website High costs 0.5 credit; Extreme-High 1 credit; Redo is free, but downstream confirmation, texturing and BANG can cost extra. Check the active button each time; no automated purchases/credit spending are made by these Actions.
- Agentic Mode is a separate workflow. It has a 5-min planning interface and previously consumed 1 credit. Never silently select Agentic when a manual High run is intended.
- The signed-in site intermittently renders no Mine assets after reload, despite earlier seeing the same account's cards. `assets` intentionally returns `empty_or_unloaded` and must not retry a possibly paid generation to compensate.
- `upload_file` may set a native file input while React does *not* show the selected photo or enable Generate. This must be treated as **blocked**, not a successful upload. A generation Action cannot be marked verified until real thumbnail → submitted task → completed model → downloaded USDZ is demonstrated.
- On the real web 3D Editing view, `.obj .fbx .glb`, Parts / Refine / Modify and Free Preview labels are displayed. Use a GLB copy for web editing; **USDZ is not a verified editing input there**. API Rigging independently accepts USDZ directly, with Creator Basic API access.
- The user's privately owned reference photos and output models stay in the ignored ToyAlive `.build/` tree; never commit them or their URLs here. The Neo.app File Service model catalog is public read-only, so only chosen **shareable USDZ** may be published there, never original photographs.

## ToyAlive quality strategy

1. Reference quality: EXIF-transpose every photo into upright pixels, preserve aspect ratio, isolate from background, select one sharp front photo first, and add back/side only if truly consistent. Mark view directions explicitly.
2. Geometry: Gen-2.5 High manual as the economical baseline; compare Extreme-High if eyes and mouth remain unclear, keeping input images unchanged for A/B fairness. Review face and body geometry from multiple directions before paying to confirm texture.
3. Local repair: Parts / Partial Edit / Refine can adjust eye sockets, nose, mouth, arms or toes without changing the entire model. Keep component identity/pivots and normals/UV continuity in sight; photos or instructions do not automatically create articulated eyes.
4. Motion: Rodin Rigging can add body skeleton and stock clips (`human_sp/idle`, etc.), or customized ear/limb joints, but this does **not** prove lip-sync blendshapes, separate eyeballs or blinking morphs. Test actual skeleton and exported animation against ToyAlive RealityKit runtime before release.
5. Mobile: keep raw source and rigged/edited variants privately; compact exported USDZ to <=60MiB and validate `usdchecker`, 4-view render, iPhone File Service catalog SHA-256 and owner feedback. The phone model library fetches/chooses a candidate while away from home.

Never create an automatically recurring generation loop, never resubmit after an ambiguous button click, and never claim a model was generated or installed before checking real outputs.

## High-level ToyAlive Action (recommended)

**Caller interface:** `webhelm platform run hyper3d toyalive-model --session-id SESSION --config /tmp/toyalive.json`. Low-level `configure`, `references`, `assets`, `editing` remain internal building blocks; users should not need to compose them.

A high-level `run` request supplies the owner objective and one or more reference images (each with an optional direction):

```json
{
  "operation": "run",
  "candidate_id": "wan-web-high-001",
  "photos": [{"path": "/absolute/local/front-upright.jpg", "direction": "Front"}],
  "effort": "High", "agentic": false,
  "face": "eyes-mouth", "body": "rigged", "motion": "idle",
  "confirm_generation": true, "max_credits": 0.5
}
```

- Website **run**: validate an immutable input image fingerprint, privately EXIF-normalize photos, set Gen-2.5 effort, attempt real browser upload, ensure the thumbnail and visible price match the selected photo count, and only then click `GENERATE` once. A durable `submission_uncertain` checkpoint is written *before* the potentially billable click. It will not retry ambiguous billable submissions. A new candidate ID is needed for different reference photos or effort. On current site sessions, image upload sometimes remains unconfirmed; `run` stops safely at `blocked`, without charging any credits. It currently supports one verified photo per website generation. Multiple images are accepted in the input plan but remain blocked until atomic multi-image website upload is demonstrated.
- **status**: inspect the saved checkpoint without a browser, or include `check_site:true` for Mine task visibility. Scrolling is attempted before deciding whether any gallery cards are visible. An unloaded gallery is never treated as evidence of a failed task.
- **rig**: optionally run the ToyAlive-owned Rodin API rigging stage against a selected USDZ; requires a fresh ID, explicit `confirm_rig_credits:true`, and `max_credits >= 0.5`. Subsequent invocations collect output instead of submitting again. The project-side `scripts/rodin_rigging_eval.py` owns the private API ledger and credit/cancellation recovery. Verify geometry, actual skeleton and animation, not merely HTTP success.
- **publish**: validate a selected local USDZ, compact to ≤60 MiB if necessary, run `usdchecker`, and publish only with `public_model_approved:true` to the Neo.app read-only File Service catalog. This step is live-verified with `wan-front-upright-raw1`, including the site's HTTPS catalog read-back. It does **not** make a private USDZ private: the catalog is a public unlisted URL.

```json
{
  "operation": "publish", "candidate_id": "wan-web-high-001",
  "source_usdz": "/absolute/path/to/validated-model-mobile.usdz",
  "public_model_approved": true,
  "title": "Wan · High · version 1", "detail": "Eyes/body review candidate",
  "source_effort": "High"
}
```

The workflow is **resumable**, not one long browser call: WebHelm Session executions have deadlines; invoking the same high-level Action and candidate ID advances only the verified next stage. Website Download/Confirm interactions are not yet fully verified, so an existing exported USDZ is still required for publish. A plan is not equivalent to a finished model.

The ToyAlive outcome gate is actual iPhone owner review of the candidate under **调整 → 查看可用模型**. A rigged torso does not prove eyes/blinking, mouth/visemes or lifelike expression; those require separate verified geometry, bones or blendshapes and RealityKit control.
