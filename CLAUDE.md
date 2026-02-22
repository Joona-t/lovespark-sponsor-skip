# LoveSpark Suite — CLAUDE.md

## Who I Am

Joona (Darkfire) — neurodivergent self-taught developer. Python background, transitioned into JavaScript and browser extension development through building this suite.

- GitHub: https://github.com/Joona-t
- Portfolio: https://joona-t.github.io

## What LoveSpark Is

A suite of free, open-source browser extensions and tools designed for neurodivergent coders and anyone who wants a calmer, more beautiful internet.

**Mission:** Retro pink productivity tools that reduce digital distractions and make browsing feel good.

**Hard rules — non-negotiable:**
- No ads, ever
- No data collection, ever
- Always free
- MIT licensed
- Privacy-first (minimum permissions, local storage only)

## Brand & Aesthetic

**Style:** Y2K kawaii meets bubblegum vaporwave meets Windows 98 nostalgia. Dreamy, textural, sparkly — but not chaotic.

**Color Palette:**
| Token            | Hex       | Usage                        |
|------------------|-----------|------------------------------|
| Hot Pink         | `#FF69B4` | Primary accent, buttons, links |
| Deep Dark Rose   | `#1A0A12` | Dark backgrounds (popups, settings) |
| Soft Bubblegum   | `#FFB3D9` | Secondary accent, hover states |
| Lavender Blush   | `#FFF0F5` | Light backgrounds             |
| Pink 50          | `#FCE4EC` | Light surface color           |
| Starlight Purple | `#C084FC` | Purple accent (Starlight mode) |
| Dark Text        | `#4A0025` | Text on light backgrounds     |
| Light Text       | `#FCE4EC` | Text on dark backgrounds      |

**Typography:**
- Body/UI text: `DM Mono` (Google Fonts) — used in ALL extension popups
- Display/headings: `Press Start 2P` (Google Fonts) — used sparingly for titles
- Fallback: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

**UI Patterns:**
- Pink glow on interactive elements: `box-shadow: 0 0 12px rgba(255,105,180,0.3)`
- Rounded corners on cards and buttons
- Cute emoji as visual anchors (💕 ✨ 🌸 💖 🛡️)
- Motivational messages ("Browse in peace! 💕", "You got this! ✨")
- Dark mode default for extension popups with pink accent glows
- Pink sparkle animations for feedback (not gore, not chaos)
- Counter animations: numbers roll up with CSS transitions

## Tech Stack

- **Browser extensions:** Vanilla JS, Manifest V3, no frameworks
- **Cross-browser:** Chrome (primary), Firefox, Edge — same codebase where possible
- **Polyfill:** `webextension-polyfill` (browser-polyfill.min.js) bundled in `lib/` for Firefox compat
- **Frontend/web apps:** HTML, CSS, vanilla JS (React only for larger apps like LoveSpark Cards)
- **Hosting:** GitHub Pages for portfolio and landing page
- **Icons:** Generated with Python Pillow (pink shields, flowers, cookies)
- **Package management:** npm only where strictly needed

## Extension Architecture Rules

These apply to every extension in the suite:

**Manifest & Permissions:**
- Manifest V3 always (include `browser_specific_settings.gecko` block for Firefox)
- Request minimum permissions needed — justify every permission
- No remote code execution
- Always include a privacy policy URL

**Performance:**
- CSS injection via manifest at `document_start` to prevent visual flashing
- Content scripts at `document_idle` unless overriding window APIs (then `document_start` with `"world": "MAIN"`)
- MutationObserver: `childList + subtree` only — never `attributes` or `characterData` unless specifically needed
- No `setInterval` polling — use observers and event listeners
- Exit early in content scripts if site is whitelisted or extension is disabled

**Code Quality:**
- Clean, commented code
- Consistent file structure across all extensions
- Tag injected elements with `data-lovespark` attributes for easy cleanup
- Use `chrome.storage.local` (via polyfill as `browser.storage.local`) for all persistence
- Daily stat resets: compare `lastResetDate` to `new Date().toISOString().slice(0, 10)`

**Counter Accuracy:**
- Only increment counters for actual user-visible events (e.g., an ad video actually skipped, a banner actually hidden)
- Do NOT count every network request as a "blocked" item — this inflates numbers and erodes user trust

**Cross-Browser:**
- Bundle `browser-polyfill.min.js` in `lib/`
- Use `browser.*` namespace everywhere
- Include `browser_specific_settings.gecko.id` in manifest for Firefox
- Test: `chrome://extensions` (Chrome dev mode) + `about:debugging#/runtime/this-firefox`

## Storage Schema Convention

Every extension follows this pattern:

```javascript
{
  // Counters
  [metric]Today: number,       // resets daily
  [metric]Total: number,       // lifetime
  lastResetDate: "YYYY-MM-DD", // ISO date string

  // User preferences
  isEnabled: boolean,
  whitelistedDomains: string[],  // if applicable
  darkMode: boolean,             // if applicable

  // Extension-specific settings
  ...
}
```

## Repo & Git Conventions

- **Repo names:** kebab-case, e.g. `lovespark-popup-blocker`, `i-dont-want-cookies`
- **GitHub account:** `Joona-t`
- **Default branch:** `main`
- **Commit messages:** Short, descriptive. First commit: `"Initial release: [Name] v1.0.0 💕"`
- **Always include:** `.gitignore` (ignore `__pycache__`, `.DS_Store`, `*.pyc`, `node_modules`)
- **Portfolio site:** `Joona-t.github.io`

## Current Projects

### Shipped & Published
| Extension | Repo | Stores | Status |
|-----------|------|--------|--------|
| Anti Brainrot | `anti-brainrot` | Chrome, Firefox, Edge | ✅ Live |
| LoveSpark AdBlock | `lovespark-adblock` | Chrome, Firefox, Edge | ✅ Live |
| I Don't Want Cookies | `i-dont-want-cookies` | Chrome, Firefox, Edge | ✅ Live |

### In Development
| Project | Repo | Description |
|---------|------|-------------|
| LoveSpark Popup Blocker | `lovespark-popup-blocker` | Block popups, redirects, YouTube ads |
| LoveSpark Reader | `lovespark-reader` | Pink theme for all websites (3 modes: Sakura, Hot Pink, Starlight) |
| Are You Cooked | `are-you-cooked` | Chrome extension |
| LoveSpark Cursor Pack | — | Custom cursor theme |

### Planned / Conceptual
| Project | Description |
|---------|-------------|
| LoveSpark Cards | Web-based flashcard app with SM-2 spaced repetition + Notion integration |
| Dopamine Control | YouTube time limiter |
| Dreamy Garden | Psychedelic caterpillar game (extension) |

## YouTube Ad Blocking — Known Challenges

YouTube ad blocking is an ongoing cat-and-mouse game. Google actively rotates ad injection methods, changes class names, serves ads from same domains as video content, and detects/warns ad blocker users. Key learnings:

- Most reliable skip method: MutationObserver watching `.ad-showing` class on `.html5-video-player`, then setting `video.currentTime = video.duration`
- CSS hiding is supplementary, not primary defense
- Class names change periodically — this requires maintenance
- A home-built blocker won't match uBlock Origin's constantly-updated filter lists for YouTube specifically
- For daily driving: pair custom extensions with uBlock Origin for heavy YouTube lifting
- Counter accuracy matters: only count actually-skipped video ads, not every blocked network request

## When Helping Me Build

**Always:**
- Match the LoveSpark aesthetic (dark rose bg, pink accents, DM Mono font)
- Keep code clean and commented
- Suggest privacy-respecting approaches
- Generate complete, ship-ready files — I load unpacked and use as daily driver immediately
- Use Pillow for icon generation (pink shields/flowers at 16, 48, 128px)
- Include browser-polyfill.min.js for cross-browser compat
- Push to GitHub under `Joona-t` when asked

**Never:**
- Use overly broad CSS selectors that break legitimate sites (e.g. `[class*="cookie"]` without structural hints)
- Use `setInterval` for DOM watching — use MutationObserver
- Collect or transmit user data
- Add unnecessary dependencies or frameworks
- Forget YouTube SPA navigation handling (`yt-navigate-finish` event)

**Remind me to:**
- Update the landing page (joona-t.github.io) when new tools ship
- Add screenshots and descriptions to store listings
- Test on both Chrome and Firefox before publishing
- Check counter accuracy after building ad/popup blockers
