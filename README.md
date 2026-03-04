# LoveSpark Sponsor Skip

Auto-skip YouTube sponsor segments with style. Uses the [SponsorBlock](https://sponsor.ajay.app/) community API for segment data.

Part of the [LoveSpark Suite](https://github.com/Joona-t) — retro pink productivity tools for a calmer internet.

## Features

- **8 segment categories** — Sponsor, Self-Promo, Interaction, Intro, Outro, Preview, Non-Music, Filler
- **3 skip modes per category** — Auto-skip, Notify (3s countdown), Highlight (progress bar only)
- **Progress bar visualization** — Colored segment markers on the YouTube seek bar
- **Toast notifications** — Beautiful skip confirmations with Undo and channel whitelisting
- **Channel & video whitelisting** — Support creators you love
- **Privacy-first** — Uses SHA-256 hash prefix lookups (k-anonymity), no tracking, local storage only
- **Offline resilience** — Persistent segment cache with 24-hour TTL
- **Keyboard shortcuts** — Shift+S to toggle, Shift+W to whitelist channel

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

Segments are cached both in memory (1 hour) and persistently (24 hours) for offline resilience.

## Attribution

Segment data provided by [SponsorBlock](https://sponsor.ajay.app/) — a crowdsourced browser extension for skipping sponsor segments in YouTube videos.

## Privacy

- No data collection, no analytics, no tracking
- All settings stored locally via `chrome.storage.local`
- API requests use k-anonymity (hash prefix, not full video ID)
- See [PRIVACY.md](PRIVACY.md) for details

## License

MIT — see [LICENSE](LICENSE)
