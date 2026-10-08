# Privacy Policy — YouTube Sponsor Skip

**Last updated:** August 20, 2026

## Summary

YouTube Sponsor Skip has no analytics, tracking, accounts, or developer-operated datastore. It stores the settings and operational records listed below locally on your device and transmits a four-character hash prefix derived from the current YouTube video ID to SponsorBlock.

## Data Storage

All data is stored locally using your browser's `storage.local` API:

- **Extension preferences** (enabled/disabled state, category toggles)
- **Skip statistics** (counters and time saved)
- **Skip receipts** (short random identifiers, category, duration, and date used to make Undo exact; receipts do not contain a video or channel ID and are capped locally)
- **Whitelists** (channel and video identifiers you explicitly add)
- **Segment cache metadata** (validated category/time ranges and fetch time; fresh for 24 hours and usable as an offline fallback for at most 7 days)

Cache keys are full SHA-256 hashes of the video ID plus active-category signature. This removes immediately readable video IDs from cache keys, but the keys are deterministic and are not anonymous against someone testing a known candidate video ID. Legacy cache keys containing plain video IDs are removed on startup.

These stored records are not sent to LoveSpark or any third party. The separate SponsorBlock lookup described below transmits only a short hash prefix.

## Network Requests

The extension makes requests to the [SponsorBlock API](https://sponsor.ajay.app) to fetch crowdsourced sponsor segment data for YouTube videos. To protect your privacy:

- Video IDs are **hashed with SHA-256** before being sent
- Only the first 4 characters of the hash are transmitted (a k-anonymity technique)
- The currently enabled SponsorBlock category names are sent as the request's category filter
- The prefix is derived from browsing activity, so Firefox declares the required `browsingActivity` data category
- No account information, analytics identifier, cookies, or full video ID is included

No other network requests are made by this extension.

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Save preferences, skip statistics/receipts, whitelists, and segment cache locally |
| `host_permissions` (youtube.com) | Detect sponsor segments during video playback |
| `host_permissions` (sponsor.ajay.app) | Fetch crowdsourced segment data |

## Third-Party Services

- **SponsorBlock** ([privacy policy](https://gist.github.com/ajayyy/aa9f8ded2b573d4f73a3ffa0ef74f796)) — provides segment data via a public API. No authentication or user identification is required.

## Data Sharing

YouTube Sponsor Skip does **not**:

- Collect personal information
- Send browsing history or locally stored whitelist/cache/receipt records to LoveSpark
- Use analytics or telemetry
- Share data with third parties
- Use cookies or fingerprinting
- Require account creation

## Changes

If this privacy policy is updated, the changes will be posted to this page with an updated date.

## Contact

For questions about this privacy policy, open an issue at [github.com/Joona-t/lovespark-sponsor-skip](https://github.com/Joona-t/lovespark-sponsor-skip/issues).
