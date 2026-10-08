# VAL-RESILIENCE-001: Segment lookup fails softly and predictably

Surface: background.
Needs: mocked storage, clock, fetch responses, and abort behavior.
Behavior: Lookup rejects invalid video IDs, uses category-matched memory then persistent records no older than 24 hours before network, aborts the network request after 4 seconds, accepts only an exact-video array of known-category finite nonnegative increasing ranges, uses a category-matched stale record no older than 7 days only after timeout/network/5xx/malformed failure, and otherwise returns unavailable without throwing across the message boundary. Storage read/write failure also degrades to network/unavailable rather than rejecting.
Evidence: Integration tests cover category-coherent memory/fresh cache, timeout, 404 clean, 4xx/5xx, malformed payload, corrupt cache, storage read/write failure, bounded stale fallback, and no-cache failure with exact status/source/segments.
Fail: Invalid segment ranges reach playback control, a network request waits without a deadline, or a failure is reported as a successful clean-video result.
