// LoveSpark Sponsor Skip — content-youtube.js
// Runs on youtube.com — monitors video, fetches segments, auto-skips sponsors
'use strict';

// ── State ───────────────────────────────────────────────────────────────────
let activeSegments = [];
let currentVideoID = null;
let videoEl = null;
let timeupdateListener = null;
let isExtensionEnabled = true;
let isInitialized = false;

// ── Category display labels ─────────────────────────────────────────────────
const CATEGORY_LABELS = {
  sponsor: 'sponsor',
  selfpromo: 'self-promo',
  interaction: 'interaction',
  intro: 'intro',
  outro: 'outro',
  music_offtopic: 'music'
};

// ── Video ID extraction ─────────────────────────────────────────────────────

function getVideoID() {
  try {
    const url = new URL(window.location.href);
    // Standard: youtube.com/watch?v=XXXXXXXXXXX
    if (url.searchParams.has('v')) return url.searchParams.get('v');
    // Shorts: youtube.com/shorts/XXXXXXXXXXX
    const shortsMatch = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];
    // Embed: youtube.com/embed/XXXXXXXXXXX
    const embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) return embedMatch[1];
  } catch (e) {}
  return null;
}

// ── Video element finder ────────────────────────────────────────────────────

function getVideoElement() {
  return document.querySelector('video.html5-main-video') || document.querySelector('video');
}

function waitForVideo(callback, attempts = 0) {
  const video = getVideoElement();
  if (video) {
    callback(video);
  } else if (attempts < 20) {
    setTimeout(() => waitForVideo(callback, attempts + 1), 500);
  }
}

// ── Skip toast notification ─────────────────────────────────────────────────

function showSkipToast(segment) {
  // Remove any existing toast
  const existing = document.querySelector('[data-lovespark="skip-toast"]');
  if (existing) existing.remove();

  const [start, end] = segment.segment;
  const duration = Math.round(end - start);
  const label = CATEGORY_LABELS[segment.category] || segment.category;

  const toast = document.createElement('div');
  toast.setAttribute('data-lovespark', 'skip-toast');
  toast.textContent = `⏭️ Skipped ${label} (${duration}s) 💕`;

  Object.assign(toast.style, {
    position: 'absolute',
    bottom: '80px',
    right: '16px',
    background: 'rgba(26, 10, 18, 0.88)',
    color: '#FFB6C1',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '13px',
    fontWeight: '500',
    padding: '10px 16px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 105, 180, 0.3)',
    zIndex: '9999',
    pointerEvents: 'none',
    opacity: '1',
    transition: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'opacity 0.5s ease',
    letterSpacing: '0.01em',
    boxShadow: '0 2px 12px rgba(0,0,0,0.5)'
  });

  // Inject into the YouTube player container
  const player = document.getElementById('movie_player') ||
                 document.querySelector('ytd-player') ||
                 document.querySelector('.html5-video-container');

  if (player) {
    // Make sure player has position for absolute children
    const playerStyle = getComputedStyle(player);
    if (playerStyle.position === 'static') {
      player.style.position = 'relative';
    }
    player.appendChild(toast);
  } else {
    // Fallback: append to body with fixed positioning
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '80px',
      right: '20px'
    });
    document.body.appendChild(toast);
  }

  // Fade out after 3 seconds, then remove
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// ── Timeupdate listener — the skip engine ──────────────────────────────────

function onTimeUpdate() {
  if (!isExtensionEnabled || activeSegments.length === 0) return;
  const currentTime = videoEl.currentTime;

  for (const segment of activeSegments) {
    if (segment.skipped) continue;
    const [start, end] = segment.segment;
    // Inside segment with 0.5s buffer before end to avoid re-triggering
    if (currentTime >= start && currentTime < end - 0.5) {
      videoEl.currentTime = end;
      segment.skipped = true;

      showSkipToast(segment);

      // Report skip to background (fire-and-forget)
      chrome.runtime.sendMessage({
        action: 'skipOccurred',
        category: segment.category,
        duration: end - start
      }).catch(() => {});

      break; // Only skip one segment per timeupdate tick
    }
  }
}

// ── Attach timeupdate listener to video element ────────────────────────────

function attachTimeupdateListener(video) {
  // Detach old listener if any
  if (timeupdateListener && videoEl) {
    videoEl.removeEventListener('timeupdate', timeupdateListener);
  }

  videoEl = video;
  timeupdateListener = onTimeUpdate;
  videoEl.addEventListener('timeupdate', timeupdateListener);
}

// ── Main navigation handler ─────────────────────────────────────────────────

function onVideoChange() {
  const newVideoID = getVideoID();

  // Ignore if not on a video page or same video
  if (!newVideoID || newVideoID === currentVideoID) return;

  // Reset state for new video
  activeSegments = [];
  currentVideoID = newVideoID;

  // Detach old timeupdate listener
  if (timeupdateListener && videoEl) {
    videoEl.removeEventListener('timeupdate', timeupdateListener);
    timeupdateListener = null;
  }

  // Ask background to fetch segments
  const requestedVideoID = newVideoID;

  chrome.runtime.sendMessage({
    action: 'fetchSegments',
    videoID: newVideoID
  }).then(response => {
    if (!response) return;

    // Staleness check: user navigated away while fetch was in-flight
    if (currentVideoID !== requestedVideoID) return;

    isExtensionEnabled = response.enabled !== false;
    if (!isExtensionEnabled || !response.segments || response.segments.length === 0) return;

    // Store segments with skipped flag
    activeSegments = response.segments.map(s => ({ ...s, skipped: false }));

    // Attach timeupdate listener once video element is available
    waitForVideo(attachTimeupdateListener);

  }).catch(() => {
    // Background may not be ready yet — fail silently
  });
}

// ── Listen for enabled state changes from background ───────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'enabledChanged') {
    isExtensionEnabled = message.enabled;
    if (!message.enabled) {
      // Clear active segments to stop skipping immediately
      activeSegments = [];
    } else {
      // Re-initialize for current video
      currentVideoID = null;
      onVideoChange();
    }
  }
});

// ── YouTube SPA navigation listeners ───────────────────────────────────────

// Primary: fires on every YouTube navigation (including SPA transitions)
document.addEventListener('yt-navigate-finish', onVideoChange);

// Backup: browser history navigation
window.addEventListener('popstate', onVideoChange);

// ── Initialize on script load ───────────────────────────────────────────────

// Small delay to let YouTube initialize on first load
if (!isInitialized) {
  isInitialized = true;
  setTimeout(onVideoChange, 800);
}
