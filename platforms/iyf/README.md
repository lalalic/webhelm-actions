# IYF — WebHelm Actions

Canonical site: `https://www.iyf.tv/`.

- `home` — reads the current site homepage catalog using the existing browser session and returns categorized titles. The caller uses --auto-session and does not hold tabs.
- `search` — config `{"query":"沙丘"}`, opens actual IYF search page, parses title-level `/play/{show_id}` links and excludes homepage recommendations and bare episode digits.
- `episodes` — config `{"show_id":"xKLAIe7Zrp6"}`, opens the actual show page and returns verified `episode_id` links.
- `find` — compatibility alias calling `search` (no homepage-only scraping).
- `resolve` — verifies the HLS URL actually loaded by the authorised player and returns it for Roku playback; caller uses `--auto-session`, and WebHelm recycles the leased tab.
- `open` — opens an exact verified IYF play page in a new WebHelm tab; this is not Agent-to-Roku playback.

Do not invent show IDs, episode IDs, availability, or media URLs. This platform's Actions perform website search and navigation. Roku Service calls the `resolve` WebHelm Action to discover signed HLS playback URLs, and the Roku app is responsible for player launch.

Real WebHelm E2E (2026-11-04): `iyf search` with query `沙丘` returned five title matches including `沙丘：预言`; `iyf episodes` for show `xKLAIe7Zrp6` returned six episodes. The tests for new Actions are in `platforms/iyf/tests/actions.test.mjs`.

Live verification on 2026-11-15: home returned 76 items; search returned five matching show titles for 沙丘; episodes returned six entries for a known show; resolve returned a signed HLS playlist URL without retaining its browser tab.
