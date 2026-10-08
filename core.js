'use strict';

const CATEGORIES = Object.freeze([
  'sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview',
  'music_offtopic', 'filler'
]);
const MODES = Object.freeze(['auto', 'notify', 'highlight', 'off']);
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const RECEIPT_ID_RE = /^skip_[A-Za-z0-9_-]{16,128}$/;

function isValidVideoId(value) {
  return typeof value === 'string' && VIDEO_ID_RE.test(value);
}

function parseYouTubeVideoId(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, 'https://www.youtube.com');
    const watchID = url.pathname === '/watch' ? url.searchParams.get('v') : null;
    const pathMatch = url.pathname.match(/^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})(?:\/|$)/);
    const candidate = watchID || pathMatch?.[1] || null;
    return isValidVideoId(candidate) ? candidate : null;
  } catch (_) {
    return null;
  }
}

function isValidMode(value) {
  return typeof value === 'string' && MODES.includes(value);
}

function normalizeModes(value, defaults = {}) {
  const normalized = {};
  for (const category of CATEGORIES) {
    const candidate = value && value[category];
    normalized[category] = isValidMode(candidate)
      ? candidate
      : (isValidMode(defaults[category]) ? defaults[category] : 'off');
  }
  return normalized;
}

function activeCategorySignature(modes) {
  return CATEGORIES.filter(category => modes[category] !== 'off').sort().join(',');
}

function isValidSegment(segment) {
  if (!segment || typeof segment !== 'object' || !CATEGORIES.includes(segment.category)) return false;
  if (!Array.isArray(segment.segment) || segment.segment.length !== 2) return false;
  const [start, end] = segment.segment;
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= 24 * 60 * 60;
}

function validateSegments(segments) {
  if (!Array.isArray(segments) || segments.length > 1000) return null;
  if (!segments.every(isValidSegment)) return null;
  return segments.map(item => ({
    segment: [item.segment[0], item.segment[1]],
    category: item.category,
    ...(typeof item.UUID === 'string' && item.UUID.length <= 128 ? { UUID: item.UUID } : {})
  }));
}

function extractSegments(payload, videoID) {
  if (!isValidVideoId(videoID) || !Array.isArray(payload) || payload.length > 4096) return null;
  const match = payload.find(item => item && item.videoID === videoID);
  return match ? validateSegments(match.segments) : [];
}

function isInRange(currentTime, segment, endBuffer = 0.3) {
  return isValidSegment(segment) && Number.isFinite(currentTime)
    && currentTime >= segment.segment[0]
    && currentTime < segment.segment[1] - endBuffer;
}

function cacheKeyFromDigest(digest) {
  return `segment_cache_v3_${digest}`;
}

function isLegacyRawCacheKey(key, record) {
  return /^cache_[A-Za-z0-9_-]{11}$/.test(key)
    && Boolean(record && typeof record === 'object'
      && Number.isFinite(record.fetchedAt)
      && validateSegments(record.segments) !== null);
}

function isValidChannel(value) {
  return Boolean(value && typeof value === 'object'
    && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 200
    && typeof value.name === 'string' && value.name.length <= 200);
}

function sanitizeDuration(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 24 * 60 * 60
    ? Math.round(number)
    : null;
}

function isValidReceiptId(value) {
  return typeof value === 'string' && RECEIPT_ID_RE.test(value);
}

function presentStatus(status, source, count) {
  const n = Number.isFinite(count) ? Math.max(0, count) : 0;
  const labels = {
    unknown: ['unknown', 'Waiting for current video status…'],
    loading: ['loading', 'Checking this video…'],
    disabled: ['disabled', 'Sponsor Skip is disabled'],
    whitelisted: ['whitelisted', 'This video or channel is allowed'],
    'non-video': ['non-video', 'Open a YouTube video to scan segments'],
    unavailable: ['unavailable', 'Segment data is temporarily unavailable; playback continues normally'],
    clean: ['clean', 'No matching segments found for this video'],
    'cached-offline': ['cached-offline', n ? `${n} cached segment${n === 1 ? '' : 's'} ready (offline)` : 'Cached result has no matching segments (offline)'],
    ready: ['ready', `${n} segment${n === 1 ? '' : 's'} ready${source === 'cache' ? ' (cached)' : ''}`]
  };
  const [state, message] = labels[status] || labels.unknown;
  return { state, message, source: source || null, count: n };
}

function createLifecycleController({ setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let generation = 0;
  let countdownTimer = null;
  let retryTimer = null;
  let retried = false;
  const clearOwnedTimers = () => {
    if (countdownTimer !== null) clearTimer(countdownTimer);
    if (retryTimer !== null) clearTimer(retryTimer);
    countdownTimer = retryTimer = null;
  };
  const cancel = () => { generation += 1; clearOwnedTimers(); };
  const begin = () => { cancel(); retried = false; return generation; };
  const valid = token => token === generation;
  const countdown = (token, ms, callback) => {
    if (!valid(token)) return false;
    if (countdownTimer !== null) clearTimer(countdownTimer);
    countdownTimer = setTimer(() => {
      countdownTimer = null;
      if (valid(token)) callback();
    }, ms);
    return true;
  };
  const retryOnce = (token, ms, callback) => {
    if (!valid(token) || retried) return false;
    retried = true;
    retryTimer = setTimer(() => {
      retryTimer = null;
      if (valid(token)) callback();
    }, ms);
    return true;
  };
  return { cancel, begin, valid, countdown, retryOnce, isRetried: () => retried };
}

function createVideoBinding({ onTimeUpdate, onMetadata } = {}) {
  let current = null;
  let metadataPending = false;
  const handleMetadata = () => {
    metadataPending = false;
    if (current && typeof onMetadata === 'function') onMetadata(current);
  };
  const detach = () => {
    if (!current) return false;
    current.removeEventListener('timeupdate', onTimeUpdate);
    current.removeEventListener('seeking', onTimeUpdate);
    if (metadataPending) current.removeEventListener('loadedmetadata', handleMetadata);
    current = null;
    metadataPending = false;
    return true;
  };
  const attach = video => {
    if (!video || typeof video.addEventListener !== 'function' || video === current) return false;
    detach();
    current = video;
    current.addEventListener('timeupdate', onTimeUpdate);
    current.addEventListener('seeking', onTimeUpdate);
    if (Number.isFinite(current.duration) && current.duration > 0) {
      if (typeof onMetadata === 'function') onMetadata(current);
    } else {
      metadataPending = true;
      current.addEventListener('loadedmetadata', handleMetadata, { once: true });
    }
    return true;
  };
  return { attach, detach, current: () => current };
}

const api = {
  CATEGORIES, MODES, isValidVideoId, parseYouTubeVideoId, isValidMode, normalizeModes,
  activeCategorySignature, isValidSegment, validateSegments, extractSegments,
  isInRange, cacheKeyFromDigest, isLegacyRawCacheKey, isValidChannel,
  sanitizeDuration, isValidReceiptId, presentStatus, createLifecycleController,
  createVideoBinding
};
if (typeof globalThis !== 'undefined') globalThis.LoveSparkCore = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
