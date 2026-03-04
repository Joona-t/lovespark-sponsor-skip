// LoveSpark Sponsor Skip v2 — content.js
'use strict';

// ── YouTube selectors (centralized for easy maintenance) ─────────────────────

const YT = {
  VIDEO:         'video.html5-main-video, video',
  PLAYER:        '#movie_player, ytd-player, .html5-video-player',
  PROGRESS_LIST: '.ytp-progress-list',
  CHANNEL_NAME:  '#channel-name a, ytd-channel-name a, #owner-name a',
};

// ── Category labels & colors ─────────────────────────────────────────────────

const CATEGORY_LABELS = {
  sponsor: 'Sponsor', selfpromo: 'Self-Promo', interaction: 'Interaction',
  intro: 'Intro', outro: 'Outro', preview: 'Preview',
  music_offtopic: 'Non-Music', filler: 'Filler'
};

// ── Skip engine constants ────────────────────────────────────────────────────

const SKIP_COOLDOWN_MS     = 2000;
const SKIP_END_BUFFER      = 0.3;
const VIDEO_POLL_INTERVAL  = 500;
const VIDEO_POLL_MAX       = 30;
const DEBOUNCE_NAV_MS      = 300;
const TOAST_AUTO_DISMISS   = 4000;

// ── Global state ─────────────────────────────────────────────────────────────

let activeSegments   = [];
let currentVideoID   = null;
let videoEl          = null;
let isEnabled        = true;
let isInitialized    = false;
let navDebounceTimer = null;
let toastHost        = null;
let toastShadow      = null;

// ── Utility ──────────────────────────────────────────────────────────────────

function getVideoID() {
  const url = location.href;
  const match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
    || url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/)
    || url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function getVideoElement() {
  return document.querySelector(YT.VIDEO);
}

function getPlayer() {
  return document.querySelector(YT.PLAYER);
}

function getChannelInfo() {
  const el = document.querySelector(YT.CHANNEL_NAME);
  if (!el) return null;
  const href = el.href || '';
  const match = href.match(/\/(channel|c|@)\/([^/?]+)/);
  return { id: match ? match[2] : href, name: el.textContent.trim() };
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds) {
  const rounded = Math.round(seconds);
  if (rounded >= 60) return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
  return `${rounded}s`;
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  if (children) for (const child of children) node.appendChild(child);
  return node;
}

// ── Toast system (Shadow DOM) ────────────────────────────────────────────────

const TOAST_STYLES = `
  :host { all: initial; }
  .ls-toast {
    position: absolute;
    bottom: 60px;
    right: 12px;
    max-width: 320px;
    background: rgba(19, 14, 28, 0.92);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 110, 180, 0.33);
    border-radius: 12px;
    padding: 10px 14px;
    color: #fff;
    font-family: 'DM Mono', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    box-shadow: 0 0 20px rgba(255, 110, 180, 0.19);
    z-index: 9999;
    opacity: 0;
    transform: translateY(8px);
    animation: ls-slide-in 0.25s ease forwards;
    pointer-events: auto;
  }
  .ls-toast.ls-fade-out {
    animation: ls-slide-out 0.3s ease forwards;
  }
  .ls-toast-text {
    margin-bottom: 6px;
    text-shadow: 0 0 8px rgba(255, 110, 180, 0.25);
  }
  .ls-toast-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .ls-toast-btn {
    background: rgba(255, 110, 180, 0.2);
    border: 1px solid rgba(255, 110, 180, 0.4);
    color: #ff9fd3;
    border-radius: 6px;
    padding: 4px 10px;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .ls-toast-btn:hover {
    background: rgba(255, 110, 180, 0.35);
  }
  .ls-toast-countdown {
    color: #ff6eb4;
    font-weight: 500;
    line-height: 24px;
  }
  @keyframes ls-slide-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes ls-slide-out {
    from { opacity: 1; transform: translateY(0); }
    to   { opacity: 0; transform: translateY(8px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .ls-toast { animation: none; opacity: 1; transform: none; }
    .ls-toast.ls-fade-out { opacity: 0; }
  }
`;

function ensureToastHost() {
  if (toastHost && toastHost.isConnected) return;
  const player = getPlayer();
  if (!player) return;

  const style = getComputedStyle(player);
  if (style.position === 'static') player.style.position = 'relative';

  toastHost = document.createElement('div');
  toastHost.id = 'ls-toast-host';
  toastHost.setAttribute('data-lovespark', 'toast');
  toastShadow = toastHost.attachShadow({ mode: 'closed' });

  const styleEl = document.createElement('style');
  styleEl.textContent = TOAST_STYLES;
  toastShadow.appendChild(styleEl);

  player.appendChild(toastHost);
}

function clearToasts() {
  if (toastShadow) {
    toastShadow.querySelectorAll('.ls-toast').forEach(t => t.remove());
  }
}

function dismissToast(toast) {
  toast.classList.add('ls-fade-out');
  setTimeout(() => toast.remove(), 300);
}

function showAutoSkipToast(segment) {
  ensureToastHost();
  if (!toastShadow) return;
  clearToasts();

  const [start, end] = segment.segment;
  const saved = Math.round(end - start);
  const label = CATEGORY_LABELS[segment.category] || segment.category;
  const channel = getChannelInfo();

  const undoBtn = el('button', { class: 'ls-toast-btn', text: 'Undo' });
  undoBtn.addEventListener('click', () => {
    if (videoEl) videoEl.currentTime = start;
    dismissToast(toast);
  });

  const actions = el('div', { class: 'ls-toast-actions' }, [undoBtn]);

  if (channel) {
    const wlBtn = el('button', { class: 'ls-toast-btn', text: `Allow from @${channel.name}` });
    wlBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'addChannelWhitelist', channel }).catch(() => {});
      activeSegments = [];
      removeProgressMarkers();
      dismissToast(toast);
    });
    actions.appendChild(wlBtn);
  }

  const toast = el('div', { class: 'ls-toast' }, [
    el('div', { class: 'ls-toast-text', text: `⏭️ ${label} skipped — saved ${formatDuration(saved)} 💖` }),
    actions
  ]);

  toastShadow.appendChild(toast);
  setTimeout(() => dismissToast(toast), TOAST_AUTO_DISMISS);
}

function showNotifyToast(segment) {
  ensureToastHost();
  if (!toastShadow) return;
  clearToasts();

  const [start, end] = segment.segment;
  const label = CATEGORY_LABELS[segment.category] || segment.category;

  const countdownEl = el('span', { class: 'ls-toast-countdown', text: 'Skipping in 3...' });
  const watchBtn = el('button', { class: 'ls-toast-btn', text: 'Watch anyway' });

  const toast = el('div', { class: 'ls-toast' }, [
    el('div', { class: 'ls-toast-text', text: `💰 ${label} detected (${formatTime(start)} — ${formatTime(end)})` }),
    el('div', { class: 'ls-toast-actions' }, [countdownEl, watchBtn])
  ]);

  let remaining = 3;
  let cancelled = false;

  const interval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(interval);
      if (!cancelled) {
        executeSkip(segment);
        dismissToast(toast);
      }
      return;
    }
    countdownEl.textContent = `Skipping in ${remaining}...`;
  }, 1000);

  watchBtn.addEventListener('click', () => {
    cancelled = true;
    clearInterval(interval);
    segment._userAllowed = true;
    dismissToast(toast);
  });

  toastShadow.appendChild(toast);
}

// ── Progress bar visualization ───────────────────────────────────────────────

function removeProgressMarkers() {
  document.querySelectorAll('.ls-segments').forEach(el => el.remove());
}

function injectProgressMarkers() {
  removeProgressMarkers();
  if (!videoEl || !videoEl.duration || activeSegments.length === 0) return;

  const progressList = document.querySelector(YT.PROGRESS_LIST);
  if (!progressList) return;

  const duration = videoEl.duration;
  const container = document.createElement('div');
  container.className = 'ls-segments';
  container.setAttribute('data-lovespark', 'segments');

  for (const seg of activeSegments) {
    if (seg.mode === 'off') continue;

    const [start, end] = seg.segment;
    const left = (start / duration) * 100;
    const width = ((end - start) / duration) * 100;
    const label = CATEGORY_LABELS[seg.category] || seg.category;

    const marker = document.createElement('div');
    marker.className = 'ls-segment';
    marker.setAttribute('data-category', seg.category);
    marker.style.left = `${left}%`;
    marker.style.width = `${width}%`;
    marker.title = `${label} (${formatTime(start)} — ${formatTime(end)})`;

    container.appendChild(marker);
  }

  progressList.appendChild(container);
}

// ── Skip execution ───────────────────────────────────────────────────────────

function executeSkip(segment) {
  if (!videoEl) return;

  const [start, end] = segment.segment;
  const duration = Math.round(end - start);

  videoEl.currentTime = end;
  segment._skippedAt = Date.now();

  chrome.runtime.sendMessage({
    action: 'skipOccurred',
    category: segment.category,
    duration
  }).catch(() => {});

  showAutoSkipToast(segment);
}

// ── Core timeupdate handler ──────────────────────────────────────────────────

function onTimeUpdate() {
  if (!videoEl || !isEnabled || activeSegments.length === 0) return;

  const currentTime = videoEl.currentTime;

  for (const segment of activeSegments) {
    if (segment.mode === 'off' || segment.mode === 'highlight') continue;
    if (segment._userAllowed) continue;
    if (segment._skippedAt && Date.now() - segment._skippedAt < SKIP_COOLDOWN_MS) continue;

    const [start, end] = segment.segment;
    if (currentTime >= start && currentTime < end - SKIP_END_BUFFER) {
      if (segment.mode === 'auto') {
        executeSkip(segment);
      } else if (segment.mode === 'notify' && !segment._notifying) {
        segment._notifying = true;
        showNotifyToast(segment);
      }
      break;
    }
  }
}

// ── Video lifecycle ──────────────────────────────────────────────────────────

function detachVideo() {
  if (videoEl) {
    videoEl.removeEventListener('timeupdate', onTimeUpdate);
    videoEl = null;
  }
}

function attachVideo(video) {
  detachVideo();
  videoEl = video;
  videoEl.addEventListener('timeupdate', onTimeUpdate);

  if (videoEl.duration) {
    injectProgressMarkers();
  } else {
    videoEl.addEventListener('loadedmetadata', injectProgressMarkers, { once: true });
  }
}

function waitForVideo(callback, attempts) {
  attempts = attempts || 0;
  const video = getVideoElement();
  if (video) { callback(video); return; }
  if (attempts >= VIDEO_POLL_MAX) return;
  setTimeout(() => waitForVideo(callback, attempts + 1), VIDEO_POLL_INTERVAL);
}

// ── Video change handler (debounced) ─────────────────────────────────────────

function onVideoChange() {
  if (navDebounceTimer) clearTimeout(navDebounceTimer);
  navDebounceTimer = setTimeout(_handleVideoChange, DEBOUNCE_NAV_MS);
}

async function _handleVideoChange() {
  const videoID = getVideoID();
  if (!videoID || videoID === currentVideoID) return;

  const requestedID = videoID;
  currentVideoID = videoID;

  detachVideo();
  activeSegments = [];
  removeProgressMarkers();
  clearToasts();

  if (!isEnabled) return;

  try {
    const channel = getChannelInfo();
    const response = await chrome.runtime.sendMessage({
      action: 'fetchSegments',
      videoID,
      channelID: channel?.id || null
    });

    if (currentVideoID !== requestedID) return;
    if (response.whitelisted) return;

    activeSegments = (response.segments || []).map(s => ({
      ...s,
      _skippedAt: 0,
      _notifying: false,
      _userAllowed: false
    }));

    waitForVideo(attachVideo);
  } catch (e) {}
}

// ── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'enabledChanged':
      isEnabled = message.enabled;
      if (!isEnabled) {
        detachVideo();
        activeSegments = [];
        removeProgressMarkers();
        clearToasts();
      } else {
        currentVideoID = null;
        onVideoChange();
      }
      break;

    case 'modesChanged':
      currentVideoID = null;
      onVideoChange();
      break;

    case 'getChannelInfo':
      sendResponse(getChannelInfo());
      return true;

    case 'channelWhitelisted':
      activeSegments = [];
      removeProgressMarkers();
      clearToasts();
      break;
  }
});

// ── SPA navigation detection ─────────────────────────────────────────────────

document.addEventListener('yt-navigate-finish', onVideoChange);
window.addEventListener('popstate', onVideoChange);

const titleEl = document.querySelector('title');
if (titleEl) {
  new MutationObserver(onVideoChange).observe(titleEl, { childList: true });
}

// ── Init ─────────────────────────────────────────────────────────────────────

(async function init() {
  try {
    const data = await chrome.storage.local.get('isEnabled');
    isEnabled = data.isEnabled !== false;
  } catch (e) {}

  isInitialized = true;
  onVideoChange();
})();
