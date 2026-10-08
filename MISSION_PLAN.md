# Sponsor Skip Resilience Mission

## Boundary and current architecture

Only this extension is in scope. Existing edits under `lib/` are unrelated shared-library work and must remain untouched.

The extension has seven relevant surfaces:

- `content.js` detects YouTube SPA/video lifecycle events, renders markers/toasts, and controls playback.
- `background.js` owns settings, whitelists, statistics, segment caching, and SponsorBlock API requests.
- `popup.*` reports current-video state and lets the user control category modes.
- `settings.*` manages modes, whitelists, statistics, and documented shortcuts.
- `manifest.json` wires Chrome/Edge and Firefox runtime entry points and permissions.
- `core.js` is the dependency-free validation/lifecycle boundary shared by runtime code and tests.
- Local storage migration plus `README.md`/`PRIVACY.md` define the retained-data and public-claim surfaces.

## Evidence-backed diagnosis

1. The manifest declares Firefox support but only registers a Chrome-style service worker. Firefox requires a background `scripts` fallback, so core fetching and control can be absent. Its `Shift`-only command defaults are also invalid in Chrome and Firefox and can prevent installation.
2. A notify countdown is not cancelled by navigation or scrubbing. Its delayed callback can act on a replacement video and record a skip that did not safely occur.
3. Undo does not suppress the same segment after cooldown and does not reverse saved-time statistics, so users can be immediately re-skipped and counters overstate benefit.
4. API requests have no deadline or payload validation. Network and malformed-response failures collapse into an indistinguishable empty result.
5. Persistent cache keys contain raw YouTube video IDs, creating avoidable locally readable viewing-history identifiers not disclosed by the current privacy policy.
6. The popup reports every empty result as the same state, hiding disabled, whitelisted, cached, unavailable, loading/unknown, and genuinely clean-video outcomes.
7. API results depend on the enabled category set, but both caches are keyed only by video ID; enabling a category can reuse an incomplete cached result.
8. Promise-style `chrome.*` calls are not a reliable Firefox contract because the bundled polyfill is only an alias; runtime code must use the Promise-based `browser.*` namespace after the alias is loaded.

## Implementation plan

1. Add a dependency-free shared core for input/mode/segment validation and test it directly.
2. Register top-level Chrome/Edge service-worker and Firefox background-script entries, use a classic-worker wrapper, Promise-safe `browser.*` calls, current Firefox disclosure schema, and non-reserved primary-modifier shortcuts.
3. Make segment lookup bounded and fail-soft: category-aware memory, fresh opaque-key storage cache, a 4-second API deadline, then a maximum 7-day stale fallback; expose a non-sensitive status and fail softly on storage errors.
4. Scope countdowns and seeks to the originating video, cancel them on lifecycle changes, make Undo durable for that segment with corrected stats, and perform at most one transient-failure retry after 3 seconds while the same video remains active.
5. Render explicit current-video status in the popup and add Node-based regression/integration tests plus manifest/static checks.

## Success criteria

- A valid segment skips once and records once; navigation, disabling, scrubbing outside the segment, or video replacement cancels a pending notify skip. Undo prevents re-skipping that segment and reverses its count/time contribution once.
- API timeout, non-OK, malformed data, and cache fallback finish deterministically without unhandled rejection or unsafe segment data.
- New persistent segment-cache keys do not contain raw video IDs, and legacy raw-ID cache entries are removed.
- One unpacked package targets Chrome/Edge 121+ and Firefox 140+, declares top-level service-worker and background-script entries, uses Promise-safe APIs, accurately declares Firefox `browsingActivity` transmission, and provides non-reserved `Alt+Shift+S` / `Alt+Shift+W` commands with no new API/host permissions. Chrome and Firefox 151/153 are the local runtime evidence; Edge remains Chromium-static compatibility only.
- The popup distinguishes loading/unknown, clean, cached/offline, unavailable, disabled, whitelisted, and non-video states and rejects stale tab/video results.
- `npm test` and `npm run check` pass. Chrome must load the unpacked extension without manifest/runtime startup errors; if browser automation is unavailable, that assertion remains explicitly blocked rather than inferred from source checks.

## Risks and non-goals

- SponsorBlock availability and correctness remain external dependencies.
- No publishing, deployment, telemetry, submissions, or SponsorBlock write APIs are in scope.
- The pre-work `lib/` fingerprints recorded in `evidence/preexisting-lib.sha256` must be unchanged at delivery.
- A local automated smoke test cannot establish store acceptance or all live YouTube layout variants; manual Chrome and Firefox playback checks remain release evidence.
- A full SHA-256 cache key removes immediately readable video IDs but is deterministic and therefore not anonymous against a known candidate list.

## Capability inventory and task boundary

- Content-controller slice owns late video discovery, SPA navigation, same-ID video replacement, notify/Watch-anyway/whitelist/mode cancellation, successful-seek accounting, bounded retry, and Undo.
- Background/core slice owns input validation, category-aware cache identity, 1-hour memory and 24-hour fresh cache limits, 7-day stale fallback, 4-second request deadline, status semantics, exact-once statistic reversal, and legacy cache migration.
- Compatibility/status slice owns the dual top-level background declaration, Promise namespace, current Firefox data-collection declaration, command/documentation parity, optional badge APIs, and popup currentness after background restart.
- Validation must keep deterministic tests, static package checks, Chrome runtime smoke, and Firefox temporary-load/runtime evidence separate; an unavailable real-browser lane is blocked, never inferred from unit tests.
