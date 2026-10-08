// YouTube Sponsor Skip v2 — content.js
'use strict';

const {
  isValidVideoId, parseYouTubeVideoId, isInRange,
  createLifecycleController, createVideoBinding
} = globalThis.LoveSparkCore;
const lifecycle = createLifecycleController();
const notifyLifecycle = createLifecycleController();

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
let retryAttemptedFor = null;
let activeLifecycleToken = null;
let videoWaitTimer = null;
let pageStatus = 'unknown';
let pageSource = null;

// ── Utility ──────────────────────────────────────────────────────────────────

function getVideoID() {
  return parseYouTubeVideoId(location.href);
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
  const match = href.match(/\/(?:channel|c)\/([^/?]+)/) || href.match(/\/@([^/?]+)/);
  return { id: match ? match[1] : href, name: el.textContent.trim() };
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
  notifyLifecycle.cancel();
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
  const skippedVideoID = currentVideoID;
  const skippedVideoEl = videoEl;

  const undoBtn = el('button', { class: 'ls-toast-btn', text: 'Undo' });
  undoBtn.addEventListener('click', async () => {
    if (segment._undoRequested) return;
    segment._undoRequested = true;
    segment._userAllowed = true;
    if (currentVideoID === skippedVideoID && videoEl === skippedVideoEl &&
        Number.isFinite(start) && start >= 0 && start <= skippedVideoEl.duration) {
      skippedVideoEl.currentTime = start;
    }
    try {
      const receiptId = segment._receiptId || (await segment._skipPromise)?.receiptId;
      if (receiptId) await browser.runtime.sendMessage({ action: 'undoSkip', receiptId });
    } catch (error) {
      console.warn('[LoveSpark] Could not reverse skip statistics:', error.message);
    }
    dismissToast(toast);
  });

  const actions = el('div', { class: 'ls-toast-actions' }, [undoBtn]);

  if (channel) {
    const wlBtn = el('button', { class: 'ls-toast-btn', text: `Allow from @${channel.name}` });
    wlBtn.addEventListener('click', async () => {
      try {
        const result = await browser.runtime.sendMessage({ action: 'addChannelWhitelist', channel });
        if (!result?.ok) return;
        lifecycle.cancel();
        notifyLifecycle.cancel();
        activeSegments = [];
        pageStatus = 'whitelisted';
        pageSource = null;
        removeProgressMarkers();
        await reportPageState();
        dismissToast(toast);
      } catch (error) {
        console.warn('[LoveSpark] Could not allow this channel:', error.message);
      }
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

  const notifyVideoID = currentVideoID;
  const notifyVideoEl = videoEl;
  const token = notifyLifecycle.begin();
  const contextIsCurrent = () => notifyLifecycle.valid(token)
    && currentVideoID === notifyVideoID && videoEl === notifyVideoEl
    && isEnabled && !notifyVideoEl.paused
    && isInRange(notifyVideoEl.currentTime, segment, SKIP_END_BUFFER);
  const tick = remaining => {
    notifyLifecycle.countdown(token, 1000, () => {
      if (!contextIsCurrent()) {
        segment._notifying = false;
        dismissToast(toast);
        return;
      }
      if (remaining <= 1) {
        executeSkip(segment, notifyVideoID, notifyVideoEl);
        dismissToast(toast);
        return;
      }
      countdownEl.textContent = `Skipping in ${remaining - 1}...`;
      tick(remaining - 1);
    });
  };
  tick(3);

  watchBtn.addEventListener('click', () => {
    notifyLifecycle.cancel();
    segment._notifying = false;
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

function executeSkip(segment, expectedVideoID = currentVideoID, expectedVideoEl = videoEl) {
  if (!videoEl || videoEl !== expectedVideoEl || currentVideoID !== expectedVideoID || !isEnabled
      || !isInRange(videoEl.currentTime, segment, SKIP_END_BUFFER)) return false;

  const [, end] = segment.segment;
  const before = videoEl.currentTime;
  const duration = Math.max(0, Math.round(end - before));

  try { videoEl.currentTime = end; } catch (_) { return false; }
  if (Math.abs(videoEl.currentTime - end) > 0.5) return false;
  segment._skippedAt = Date.now();
  segment._userAllowed = true;
  segment._receiptId = `skip_${crypto.randomUUID().replaceAll('-', '_')}`;

  segment._skipPromise = browser.runtime.sendMessage({
    action: 'skipOccurred',
    category: segment.category,
    duration,
    receiptId: segment._receiptId
  }).then(result => result?.ok ? result : null).catch(() => null);

  showAutoSkipToast(segment);
  return true;
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

const videoBinding = createVideoBinding({
  onTimeUpdate,
  onMetadata: () => injectProgressMarkers()
});

// ── Video lifecycle ──────────────────────────────────────────────────────────

function detachVideo() {
  if (videoWaitTimer !== null) {
    clearTimeout(videoWaitTimer);
    videoWaitTimer = null;
  }
  videoBinding.detach();
  videoEl = null;
}

function attachVideo(video) {
  if (video === videoEl) return;
  detachVideo();
  videoEl = video;
  videoBinding.attach(video);
}

function waitForVideo(callback, attempts, expectedVideoID, token) {
  attempts = attempts || 0;
  if (!lifecycle.valid(token) || currentVideoID !== expectedVideoID) return;
  const video = getVideoElement();
  if (video) { callback(video); return; }
  if (attempts >= VIDEO_POLL_MAX) return;
  videoWaitTimer = setTimeout(() => waitForVideo(callback, attempts + 1, expectedVideoID, token), VIDEO_POLL_INTERVAL);
}

// ── Video change handler (debounced) ─────────────────────────────────────────

function onVideoChange() {
  if (navDebounceTimer) clearTimeout(navDebounceTimer);
  navDebounceTimer = setTimeout(() => _handleVideoChange(), DEBOUNCE_NAV_MS);
}

function scheduleLookupRetry(videoID) {
  if (retryAttemptedFor === videoID) return;
  retryAttemptedFor = videoID;
  const token = activeLifecycleToken;
  lifecycle.retryOnce(token, 3000, () => {
    if (isEnabled && currentVideoID === videoID) lookupForVideo(videoID, token, true);
  });
}

async function reportPageState() {
  try {
    await browser.runtime.sendMessage({
      action: 'reportPageState', videoID: currentVideoID, status: pageStatus,
      source: pageSource, segments: activeSegments
    });
  } catch (_) {}
}

async function lookupForVideo(videoID, token, isRetry) {
  try {
    const channel = getChannelInfo();
    const response = await browser.runtime.sendMessage({
      action: 'fetchSegments',
      videoID,
      channelID: channel?.id || null,
      requestId: `${videoID}:${token}:${isRetry ? 'retry' : 'initial'}`
    });

    if (!lifecycle.valid(token) || currentVideoID !== videoID) return;
    pageStatus = response.status || 'unavailable';
    pageSource = response.source || null;
    if (response.whitelisted) {
      activeSegments = [];
      await reportPageState();
      return;
    }
    if (response.status === 'unavailable') {
      activeSegments = [];
      await reportPageState();
      if (response.retryable && !isRetry) scheduleLookupRetry(videoID);
      return;
    }

    activeSegments = (response.segments || []).map(s => ({
      ...s,
      _skippedAt: 0,
      _notifying: false,
      _userAllowed: false
    }));

    await reportPageState();
    waitForVideo(attachVideo, 0, videoID, token);
  } catch (error) {
    console.warn('[LoveSpark] Segment lookup failed:', error.message);
    if (!lifecycle.valid(token) || currentVideoID !== videoID) return;
    pageStatus = 'unavailable';
    pageSource = null;
    activeSegments = [];
    await reportPageState();
    if (!isRetry) scheduleLookupRetry(videoID);
  }
}

async function _handleVideoChange({ force = false } = {}) {
  const videoID = getVideoID();
  if (!isValidVideoId(videoID)) {
    lifecycle.cancel();
    activeLifecycleToken = null;
    retryAttemptedFor = null;
    currentVideoID = null;
    pageStatus = isEnabled ? 'non-video' : 'disabled';
    pageSource = null;
    detachVideo();
    activeSegments = [];
    removeProgressMarkers();
    clearToasts();
    await reportPageState();
    return;
  }
  if (!force && videoID === currentVideoID) {
    const replacement = getVideoElement();
    if (replacement && replacement !== videoEl) attachVideo(replacement);
    return;
  }

  activeLifecycleToken = lifecycle.begin();
  retryAttemptedFor = null;
  currentVideoID = videoID;
  pageStatus = isEnabled ? 'loading' : 'disabled';
  pageSource = null;
  detachVideo();
  activeSegments = [];
  removeProgressMarkers();
  clearToasts();
  await reportPageState();
  if (isEnabled) await lookupForVideo(videoID, activeLifecycleToken, false);
}

// ── Message listener ─────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'enabledChanged':
      isEnabled = message.enabled;
      pageStatus = isEnabled ? 'unknown' : 'disabled';
      pageSource = null;
      lifecycle.cancel();
      activeLifecycleToken = null;
      retryAttemptedFor = null;
      clearToasts();
      if (!isEnabled) {
        detachVideo();
        activeSegments = [];
        removeProgressMarkers();
        clearToasts();
        reportPageState();
      } else {
        currentVideoID = null;
        onVideoChange();
      }
      break;

    case 'modesChanged':
      lifecycle.cancel();
      clearToasts();
      currentVideoID = null;
      onVideoChange();
      break;

    case 'getPageState':
      return Promise.resolve({
        ok: true,
        videoID: currentVideoID,
        status: pageStatus,
        source: pageSource,
        segments: activeSegments.map(({ segment, category, UUID, mode }) => ({ segment, category, UUID, mode }))
      });

    case 'getChannelInfo':
      return Promise.resolve(getChannelInfo());

    case 'channelWhitelisted':
      lifecycle.cancel();
      clearToasts();
      activeSegments = [];
      pageStatus = 'whitelisted';
      pageSource = null;
      removeProgressMarkers();
      reportPageState();
      break;
  }
});

// ── SPA navigation detection ─────────────────────────────────────────────────

document.addEventListener('yt-navigate-finish', onVideoChange);
window.addEventListener('popstate', onVideoChange);
document.addEventListener('loadedmetadata', event => {
  if (event.target?.matches?.(YT.VIDEO) && event.target !== videoEl && isValidVideoId(currentVideoID)) {
    attachVideo(event.target);
  }
}, true);

const titleEl = document.querySelector('title');
if (titleEl) {
  new MutationObserver(onVideoChange).observe(titleEl, { childList: true });
}

// ── Init ─────────────────────────────────────────────────────────────────────

(async function init() {
  try {
    const data = await browser.storage.local.get('isEnabled');
    isEnabled = data.isEnabled !== false;
  } catch (e) {}

  isInitialized = true;
  onVideoChange();
})();
