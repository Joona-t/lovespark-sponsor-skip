# VAL-RETRY-001: Transient lookup retry is bounded and lifecycle-aware

Surface: browser.
Needs: fake clock, transient unavailable response, active-video lifecycle fixture.
Behavior: A network/timeout/5xx/malformed unavailable lookup schedules at most one retry after 3 seconds for the same enabled video, and cancels it on navigation, non-video transition, disable, mode change, whitelist, success, or exhaustion. Clean 404 and invalid local input never retry.
Evidence: `npm test` asserts retry count, delay, success, cancellation, and exhaustion with deterministic timers.
Fail: Work continues for an inactive video, more than one retry occurs, or retry becomes recurring polling.
