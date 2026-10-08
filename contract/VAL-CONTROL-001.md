# VAL-CONTROL-001: Delayed playback changes are scoped to the active video

Surface: browser.
Needs: a YouTube-like video element and auto/notify segment fixtures.
Behavior: A valid in-range segment may seek and record once only after a successful seek. Navigation, disable, same-ID video replacement, non-video transition, mode change, channel whitelist, Watch anyway, toast cancellation, pause/scrub outside the segment, or player detachment cancels pending notification work and cannot seek or record stale work.
Evidence: `npm test` exercises deterministic fake-clock/video fixtures for every cancellation case with exact seek and record counts, including successful-seek-before-record ordering. Manual release check: load unpacked, start a Notify segment, navigate before countdown completes, and observe no seek/toast/stat increment on the destination video.
Fail: Any delayed callback can seek a different video or increment statistics without a successful in-range seek. If the manual browser surface cannot be exercised, browser-level verdict is blocked rather than passed from unit tests.
