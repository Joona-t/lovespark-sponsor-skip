# Bugs & Iterations

## : |2026-03-05|||Fix theme dropdown: add missing CSS styles for styled dropdown menu

**Problem:** |2026-03-05|||Fix theme dropdown: add missing CSS styles for styled dropdown menu
**Files:** manifest.json,popup.css
**Commit:** 92b7d3e

## : |2026-03-05|||fix: theme title text visibility on beige (#4a7c59 earthy green) and slate (#d4714e terracotta)

**Problem:** |2026-03-05|||fix: theme title text visibility on beige (#4a7c59 earthy green) and slate (#d4714e terracotta)
**Files:** manifest.json,popup.css,settings.css
**Commit:** a542075

## : |2026-03-05|||fix: replace broken footer with aesthetic ls-footer

**Problem:** |2026-03-05|||fix: replace broken footer with aesthetic ls-footer
**Files:** lib/lovespark-base.css,lib/lovespark-footer.css,lib/lovespark-footer.js,manifest.json,popup.html
**Commit:** c253c72

## : |2026-03-04|||Fix description length for Chrome Web Store (max 132 chars)

**Problem:** |2026-03-04|||Fix description length for Chrome Web Store (max 132 chars)
**Files:** _locales/am/messages.json,_locales/ar/messages.json,_locales/bg/messages.json,_locales/bn/messages.json,_locales/ca/messages.json
**Commit:** c5442af

<!-- Format:
## YYYY-MM-DD: Short Title

**Problem:** What went wrong or needed changing
**Root cause:** Why it happened
**Fix:** What was done to resolve it
-->


## 2026-03-28: Fleet-wide automation regression — broken CSS variables + missing footers

**Problem:** A post-swarm-audit automation run injected `lovespark-tokens.css` and `lovespark-base.css` into popup.html, and replaced `--ls-pink-accent` with undefined `--ls-btn-bg` in popup.css. This broke toggle colors (rendered transparent) and changed disabled opacity from 0.4 to 0.9. Footer buttons were also missing from 26 extensions.
**Root cause:** Batch automation (`sync-shared-lib.sh` or swarm pass) overwrote extension CSS without validating variable definitions. The `--ls-btn-bg` variable was never defined in any CSS file.
**Fix:** Reverted all 76 git repos to last committed state. Fixed 3 extensions (cookie-nuke, breathe, planner) that had the bug baked into commits. Added footer buttons (LoveSpark Suite, Ko-fi, Report a Bug) to all 26 missing extensions. Updated shared lib footer to make LoveSpark Suite a proper link to lovespark.love. Deployed `guard-fleet-sync.sh` — 4-gate pre-sync validator that blocks automations introducing undefined CSS variables.
**Files:** popup.css, popup.html, lib/lovespark-footer.js, lib/lovespark-footer.css
**Commit:** fleet-wide fix, multiple commits

## 2026-06-26: Rename display title "LoveSpark Sponsor Skip" → "YouTube Sponsor Skip"

**Problem:** Owner requested the package/display title be renamed from "LoveSpark Sponsor Skip" to "YouTube Sponsor Skip" (the "Title from package" shown by AMO/CWS at upload).
**Root cause:** N/A — product naming change.
**Fix:** Exact-string replace of "LoveSpark Sponsor Skip" → "YouTube Sponsor Skip" across all 55 `_locales/*/messages.json` `extName` values (all previously held the identical untranslated English string), plus UI titles + comment headers in popup/settings/content/background, README.md, PRIVACY.md, generate_icons.py. Hyphenated package id `lovespark-sponsor-skip` (dir/repo/storage keys) intentionally left unchanged. Bumped manifest version 2.0.35 → 2.0.36. All JSON validated.
**Files:** manifest.json, 55× _locales/*/messages.json, popup.html, popup.js, popup.css, settings.html, settings.js, settings.css, content.js, content-styles.css, background.js, README.md, PRIVACY.md, generate_icons.py
