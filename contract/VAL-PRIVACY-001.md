# VAL-PRIVACY-001: Persistent cache avoids raw viewing identifiers

Surface: data.
Needs: mocked extension local storage containing both current and legacy cache entries.
Behavior: New persistent segment entries use a full SHA-256-derived key over video ID plus active-category signature rather than either raw value, startup removes only legacy raw-video-ID cache keys while preserving preferences, stats, and whitelists, and new cache records contain no raw video ID.
Evidence: Automated storage tests assert category-aware written/removed key names, absence of raw IDs/categories, 24-hour fresh and 7-day maximum stale retention, and preservation of unrelated keys; source/manifest inspection confirms no added permissions or telemetry.
Fail: A newly written cache key embeds the video ID, or migration deletes unrelated local data.
