# YouTube Sponsor Skip

Auto-skip YouTube sponsor segments with style. Uses the [SponsorBlock](https://sponsor.ajay.app/) community API for segment data.

Part of the [LoveSpark Suite](https://github.com/Joona-t) — retro pink productivity tools for a calmer internet.

## Features

- **8 segment categories** — Sponsor, Self-Promo, Interaction, Intro, Outro, Preview, Non-Music, Filler
- **3 skip modes per category** — Auto-skip, Notify (3s countdown), Highlight (progress bar only)
- **Progress bar visualization** — Colored segment markers on the YouTube seek bar
- **Toast notifications** — Beautiful skip confirmations with Undo and channel whitelisting
- **Channel & video whitelisting** — Support creators you love
- **Privacy-first** — Sends only a four-character SHA-256 prefix for SponsorBlock lookups, with no analytics or tracking
- **Offline resilience** — Persistent hashed-key segment cache with a 24-hour fresh TTL and a maximum 7-day stale fallback
- **Keyboard shortcuts** — Alt+Shift+S to toggle, Alt+Shift+W to whitelist channel

## Install

### Chrome Web Store
Coming soon.

### Firefox Add-ons
Coming soon.

### Manual
1. Clone or download this repo
2. Open `chrome://extensions` (Chrome) or `about:debugging#/runtime/this-firefox` (Firefox)
3. Enable Developer Mode, click "Load unpacked", select this folder

## How It Works

Segment data is fetched from the SponsorBlock public API using a privacy-preserving hash prefix method. Results are filtered client-side so the full video ID is never sent to the server.

Segments are cached in memory for 1 hour and persistently as fresh data for 24 hours. If SponsorBlock is unavailable, a matching cache entry may be used for at most 7 days and the popup labels it as offline cache data. Cache keys are deterministic full hashes of the video ID plus enabled-category set; this avoids plain-text video IDs but is not anonymity against a known candidate list.

## Attribution

Segment data provided by [SponsorBlock](https://sponsor.ajay.app/) — a crowdsourced browser extension for skipping sponsor segments in YouTube videos.

## Privacy

- No analytics or tracking
- Preferences, statistics, skip receipts, whitelists, and segment cache records are stored locally via `browser.storage.local`
- API requests use k-anonymity (hash prefix, not full video ID)
- See [PRIVACY.md](PRIVACY.md) for details

## License

MIT — see [LICENSE](LICENSE)
