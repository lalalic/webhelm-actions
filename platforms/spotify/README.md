# Spotify Web Actions

Site: `https://open.spotify.com/` using the existing signed-in WebHelm managed Chrome profile.

Actions:

- `library` (read-only): returns playlist and Liked Songs links **only from the authenticated user's Your Library**. Public search results must never be labeled personal.
- `search` (read-only): searches the Spotify Web UI for songs, artists, albums and playlists. It returns verified page URLs, not streaming-media URLs.
- `play`: requires `config.url` and `config.confirm_playback: true`. Accepts only `https://open.spotify.com/playlist/{id}`, `album/{id}`, `track/{id}`, or `collection/tracks`. Uses Spotify's own Play button, verifies the web player is playing, and explicitly reports `roku_output_verified: false`. Does not rip music, copy cookies or emulate Spotify Connect.

CLI examples:

```sh
webhelm platform run spotify library --auto-session
webhelm platform run spotify search --auto-session --config /tmp/spotify-search.json
webhelm platform run spotify play --auto-session --config /tmp/spotify-play-confirmed.json
```

`spotify-search.json` is `{"query":"Lonely People"}`. `spotify-play-confirmed.json` is `{"url":"https://open.spotify.com/collection/tracks","confirm_playback":true}`.

For autoplay/play actions, verify output device separately through Spotify's official Connect dialog. **Do not assume Spotify Web playing on Neo Master means Roku audio is playing.** The personal library may include unavailable playlist entries; these should not be selected as playable.

Tests: `node --test platforms/spotify/tests/*.test.mjs`, plus a real read-only library and search Action.
