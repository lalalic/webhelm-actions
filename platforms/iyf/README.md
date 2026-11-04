# IYF — WebHelm Actions

Canonical site: `https://www.iyf.tv/`.

- `search` — config `{"query":"沙丘"}`, opens actual IYF search page, parses title-level `/play/{show_id}` links and excludes homepage recommendations and bare episode digits.
- `episodes` — config `{"show_id":"xKLAIe7Zrp6"}`, opens the actual show page and returns verified `episode_id` links.
- `find` — compatibility alias calling `search` (no homepage-only scraping).
- `open` — opens an exact verified IYF play page in a new WebHelm tab; this is not Agent-to-Roku playback.

Do not invent show IDs, episode IDs, availability, or media URLs. This platform's Actions perform website search and navigation. Neo Master's `iyf-roku` backend is responsible for signed HLS playback resolution, and the Roku app is responsible for player launch.

Real WebHelm E2E (2026-11-04): `iyf search` with query `沙丘` returned five title matches including `沙丘：预言`; `iyf episodes` for show `xKLAIe7Zrp6` returned six episodes. The tests for new Actions are in `platforms/iyf/tests/actions.test.mjs`.
