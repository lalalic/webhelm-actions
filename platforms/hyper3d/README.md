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
