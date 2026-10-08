# VAL-DETECTION-001: Detection survives YouTube lifecycle changes

Surface: browser.
Needs: YouTube-like watch, Shorts, embed, late-video, and replacement fixtures with deterministic timers.
Behavior: The content runtime recognizes valid watch/Shorts/embed IDs, attaches once when a video appears late, replaces listeners when the video element changes even for the same ID, cancels stale discovery callbacks, and resumes after SPA navigation without duplicate handlers.
Evidence: Deterministic DOM/controller tests assert active element identity and listener counts for late appearance, same-ID replacement, non-video transition, and multi-navigation sequences; unpacked Chrome playback/navigation smoke is supporting evidence.
Fail: Detection remains attached to a replaced element, stale polling attaches after navigation, or one active video receives duplicate handlers.

