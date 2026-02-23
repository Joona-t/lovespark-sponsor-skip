# Privacy Policy — LoveSpark Sponsor Skip

**Last updated:** February 23, 2026

## Summary

LoveSpark Sponsor Skip does **not** collect, store, or transmit any personal data. All user preferences and statistics are stored locally on your device.

## Data Storage

All data is stored locally using your browser's `storage.local` API:

- **Extension preferences** (enabled/disabled state, category toggles)
- **Skip statistics** (counters and time saved)

This data never leaves your device and is not accessible to LoveSpark or any third party.

## Network Requests

The extension makes requests to the [SponsorBlock API](https://sponsor.ajay.app) to fetch crowdsourced sponsor segment data for YouTube videos. To protect your privacy:

- Video IDs are **hashed with SHA-256** before being sent
- Only the first 4 characters of the hash are transmitted (a k-anonymity technique)
- No account information, browsing history, or personal data is included in any request

No other network requests are made by this extension.

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Save your preferences and skip statistics locally |
| `host_permissions` (youtube.com) | Detect sponsor segments during video playback |
| `host_permissions` (sponsor.ajay.app) | Fetch crowdsourced segment data |

## Third-Party Services

- **SponsorBlock** ([privacy policy](https://gist.github.com/ajayyy/aa9f8ded2b573d4f73a3ffa0ef74f796)) — provides segment data via a public API. No authentication or user identification is required.

## Data Sharing

LoveSpark Sponsor Skip does **not**:

- Collect personal information
- Track browsing activity
- Use analytics or telemetry
- Share data with third parties
- Use cookies or fingerprinting
- Require account creation

## Changes

If this privacy policy is updated, the changes will be posted to this page with an updated date.

## Contact

For questions about this privacy policy, open an issue at [github.com/Joona-t/lovespark-sponsor-skip](https://github.com/Joona-t/lovespark-sponsor-skip/issues).
