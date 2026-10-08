// YouTube Sponsor Skip v3 — shared background runtime
'use strict';

const {
  CATEGORIES,
  isValidVideoId,
  normalizeModes,
  activeCategorySignature,
  extractSegments,
  validateSegments,
  cacheKeyFromDigest,
  isLegacyRawCacheKey,
  isValidChannel,
  sanitizeDuration,
  isValidReceiptId,
  presentStatus
} = globalThis.LoveSparkCore;

const SCHEMA_VERSION = 3;
const MEMORY_CACHE_TTL = 60 * 60 * 1000;
const STORAGE_CACHE_TTL = 24 * 60 * 60 * 1000;
const STALE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const API_TIMEOUT_MS = 4000;
const MAX_WHITELIST_ITEMS = 500;
const MAX_RECEIPTS = 100;
const BADGE_COLOR = '#ff6eb4';

const DEFAULT_MODES = Object.freeze({
  sponsor: 'auto',
  selfpromo: 'auto',
  interaction: 'auto',
  intro: 'highlight',
  outro: 'highlight',
  preview: 'highlight',
  music_offtopic: 'auto',
  filler: 'highlight'
});
const DEFAULT_CATEGORY_STATS = Object.freeze(Object.fromEntries(CATEGORIES.map(category => [category, 0])));

const memoryCache = new Map(); // opaque cache key -> { segments, cachedAt, status, source }
const tabState = new Map(); // tab id -> non-persistent current-video status
const tabRequest = new Map(); // tab id -> most recent request id
let statsMutationChain = Promise.resolve();

function today() {
  return new Date().toISOString().slice(0, 10);
}

function queueStatsMutation(mutation) {
  const queued = statsMutationChain.then(mutation, mutation);
  statsMutationChain = queued.catch(() => {});
  return queued;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function cacheIdentity(videoID, categorySignature) {
  return cacheKeyFromDigest(await sha256(`${videoID}\u0000${categorySignature}`));
}

async function getCategoryModes() {
  try {
    const data = await browser.storage.local.get('categoryModes');
    return normalizeModes(data.categoryModes, DEFAULT_MODES);
  } catch (error) {
    // Settings storage must not turn a temporary browser-storage fault into an
    // unhandled lookup failure. Defaults keep playback behavior deterministic.
    console.warn('[LoveSpark] Category settings read failed:', error.message);
    return { ...DEFAULT_MODES };
  }
}

async function readCache(cacheKey) {
  try {
    const data = await browser.storage.local.get(cacheKey);
    return { record: data[cacheKey] || null, storageError: false };
  } catch (error) {
    console.warn('[LoveSpark] Cache read failed:', error.message);
    return { record: null, storageError: true };
  }
}

async function writeCache(cacheKey, segments) {
  try {
    await browser.storage.local.set({
      [cacheKey]: { segments, fetchedAt: Date.now() }
    });
  } catch (error) {
    // A valid network result remains useful even if local quota/storage fails.
    console.warn('[LoveSpark] Cache write failed:', error.message);
  }
}

function validatedCacheRecord(record) {
  if (!record || !Number.isFinite(record.fetchedAt)) return null;
  const segments = validateSegments(record.segments);
  return segments === null ? null : { segments, fetchedAt: record.fetchedAt };
}

async function fetchSegments(videoID) {
  if (!isValidVideoId(videoID)) {
    return { ok: false, status: 'unavailable', source: null, segments: [], error: 'invalid-video-id' };
  }

  const modes = await getCategoryModes();
  const categorySignature = activeCategorySignature(modes);
  if (!categorySignature) return { ok: true, status: 'clean', source: 'local', segments: [] };

  const cacheKey = await cacheIdentity(videoID, categorySignature);
  const memory = memoryCache.get(cacheKey);
  if (memory && Date.now() - memory.cachedAt <= MEMORY_CACHE_TTL) {
    return {
      ok: true,
      status: memory.status,
      source: memory.source,
      segments: memory.segments
    };
  }

  const { record } = await readCache(cacheKey);
  const stored = validatedCacheRecord(record);
  if (stored && Date.now() - stored.fetchedAt <= STORAGE_CACHE_TTL) {
    memoryCache.set(cacheKey, {
      segments: stored.segments,
      cachedAt: Date.now(),
      status: stored.segments.length ? 'ready' : 'clean',
      source: 'cache'
    });
    return {
      ok: true,
      status: stored.segments.length ? 'ready' : 'clean',
      source: 'cache',
      segments: stored.segments
    };
  }

  let timeoutId = null;
  try {
    const prefix = (await sha256(videoID)).slice(0, 4);
    const categories = categorySignature.split(',');
    const url = `https://sponsor.ajay.app/api/skipSegments/${prefix}?categories=${encodeURIComponent(JSON.stringify(categories))}`;
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const response = await fetch(url, { signal: controller.signal });

    if (response.status === 404) {
      const empty = [];
      memoryCache.set(cacheKey, { segments: empty, cachedAt: Date.now(), status: 'clean', source: 'network' });
      await writeCache(cacheKey, empty);
      return { ok: true, status: 'clean', source: 'network', segments: empty };
    }
    if (!response.ok) throw new Error(`SponsorBlock HTTP ${response.status}`);

    const segments = extractSegments(await response.json(), videoID);
    if (segments === null) throw new Error('Malformed SponsorBlock response');
    const cached = {
      segments,
      cachedAt: Date.now(),
      status: segments.length ? 'ready' : 'clean',
      source: 'network'
    };
    memoryCache.set(cacheKey, cached);
    await writeCache(cacheKey, segments);
    return {
      ok: true,
      status: segments.length ? 'ready' : 'clean',
      source: 'network',
      segments
    };
  } catch (error) {
    console.warn('[LoveSpark] SponsorBlock lookup failed:', error.message);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }

  if (stored && Date.now() - stored.fetchedAt <= STALE_CACHE_TTL) {
    memoryCache.set(cacheKey, {
      segments: stored.segments,
      cachedAt: Date.now(),
      status: 'cached-offline',
      source: 'stale-cache'
    });
    return { ok: true, status: 'cached-offline', source: 'stale-cache', segments: stored.segments };
  }
  return { ok: false, status: 'unavailable', source: null, segments: [], retryable: true };
}

async function purgePrivateLegacyData() {
  const all = await browser.storage.local.get(null);
  const expiredOrLegacy = Object.keys(all).filter(key => {
    if (isLegacyRawCacheKey(key, all[key])) return true;
    if (!key.startsWith('segment_cache_v3_')) return false;
    return Date.now() - (all[key]?.fetchedAt || 0) > STALE_CACHE_TTL;
  });
  if (expiredOrLegacy.length) await browser.storage.local.remove(expiredOrLegacy);
  // A short-lived development version stored raw IDs inside this ledger.
  if (all.skipLedger !== undefined) await browser.storage.local.remove('skipLedger');
}

async function updateBadge() {
  if (!browser.action) return;
  const data = await browser.storage.local.get(['timeSavedTotalSeconds', 'isEnabled']);
  const disabled = data.isEnabled === false;
  const seconds = Math.max(0, Number(data.timeSavedTotalSeconds) || 0);
  const text = disabled ? 'OFF' : seconds >= 3600 ? `${Math.floor(seconds / 3600)}h`
    : seconds >= 60 ? `${Math.floor(seconds / 60)}m` : seconds > 0 ? `${Math.floor(seconds)}s` : '';
  if (browser.action.setBadgeText) await browser.action.setBadgeText({ text });
  if (browser.action.setBadgeBackgroundColor) {
    await browser.action.setBadgeBackgroundColor({ color: disabled ? '#666666' : BADGE_COLOR });
  }
  if (!disabled && browser.action.setBadgeTextColor) {
    try { await browser.action.setBadgeTextColor({ color: '#FFFFFF' }); } catch (error) {
      console.warn('[LoveSpark] Badge text color unavailable:', error.message);
    }
  }
}

async function getWhitelists() {
  const data = await browser.storage.local.get(['whitelistedChannels', 'whitelistedVideos']);
  return {
    channels: Array.isArray(data.whitelistedChannels) ? data.whitelistedChannels.filter(isValidChannel) : [],
    videos: Array.isArray(data.whitelistedVideos) ? data.whitelistedVideos.filter(isValidVideoId) : []
  };
}

async function isWhitelisted(videoID, channelID) {
  const whitelist = await getWhitelists();
  return whitelist.videos.includes(videoID) ||
    (typeof channelID === 'string' && whitelist.channels.some(channel => channel.id === channelID));
}

async function addChannelWhitelist(channel) {
  if (!isValidChannel(channel)) return false;
  const whitelist = await getWhitelists();
  if (!whitelist.channels.some(item => item.id === channel.id)) whitelist.channels.push(channel);
  await browser.storage.local.set({ whitelistedChannels: whitelist.channels.slice(-MAX_WHITELIST_ITEMS) });
  return true;
}

async function addVideoWhitelist(videoID) {
  if (!isValidVideoId(videoID)) return false;
  const whitelist = await getWhitelists();
  if (!whitelist.videos.includes(videoID)) whitelist.videos.push(videoID);
  await browser.storage.local.set({ whitelistedVideos: whitelist.videos.slice(-MAX_WHITELIST_ITEMS) });
  return true;
}

function pruneReceipts(receipts) {
  const entries = Object.entries(receipts).sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
  while (entries.length > MAX_RECEIPTS) delete receipts[entries.shift()[0]];
  return receipts;
}

async function recordSkip(receiptId, category, durationValue) {
  const duration = sanitizeDuration(durationValue);
  if (!isValidReceiptId(receiptId) || !CATEGORIES.includes(category) || duration === null) {
    return { ok: false, error: 'invalid-skip' };
  }
  const data = await browser.storage.local.get([
    'sponsorsSkippedTotal', 'sponsorsSkippedToday', 'timeSavedTotalSeconds',
    'lastResetDate', 'categoryStats', 'skipReceipts'
  ]);
  const receipts = { ...(data.skipReceipts || {}) };
  const existing = receipts[receiptId];
  if (existing?.state === 'undo-pending') {
    receipts[receiptId] = { ...existing, state: 'undone', category, duration, createdAt: Date.now() };
    await browser.storage.local.set({ skipReceipts: pruneReceipts(receipts) });
    return { ok: true, receiptId, recorded: false, undone: true };
  }
  if (existing) return { ok: true, receiptId, duplicate: true, state: existing.state };

  const date = today();
  const resetToday = data.lastResetDate !== date;
  const categoryStats = { ...DEFAULT_CATEGORY_STATS, ...(data.categoryStats || {}) };
  categoryStats[category] = Math.max(0, Number(categoryStats[category]) || 0) + 1;
  receipts[receiptId] = { state: 'recorded', category, duration, date, createdAt: Date.now() };
  await browser.storage.local.set({
    sponsorsSkippedTotal: Math.max(0, Number(data.sponsorsSkippedTotal) || 0) + 1,
    sponsorsSkippedToday: (resetToday ? 0 : Math.max(0, Number(data.sponsorsSkippedToday) || 0)) + 1,
    timeSavedTotalSeconds: Math.max(0, Number(data.timeSavedTotalSeconds) || 0) + duration,
    lastResetDate: date,
    categoryStats,
    skipReceipts: pruneReceipts(receipts)
  });
  await updateBadge();
  return { ok: true, receiptId, recorded: true };
}

async function undoSkip(receiptId) {
  if (!isValidReceiptId(receiptId)) return { ok: false, error: 'invalid-receipt' };
  const data = await browser.storage.local.get([
    'skipReceipts', 'sponsorsSkippedTotal', 'sponsorsSkippedToday',
    'timeSavedTotalSeconds', 'categoryStats'
  ]);
  const receipts = { ...(data.skipReceipts || {}) };
  const receipt = receipts[receiptId];
  if (!receipt) {
    receipts[receiptId] = { state: 'undo-pending', createdAt: Date.now() };
    await browser.storage.local.set({ skipReceipts: pruneReceipts(receipts) });
    return { ok: true, receiptId, pending: true };
  }
  if (receipt.state !== 'recorded') return { ok: true, receiptId, duplicate: true, state: receipt.state };

  const categoryStats = { ...DEFAULT_CATEGORY_STATS, ...(data.categoryStats || {}) };
  categoryStats[receipt.category] = Math.max(0, (Number(categoryStats[receipt.category]) || 0) - 1);
  receipts[receiptId] = { ...receipt, state: 'undone' };
  await browser.storage.local.set({
    sponsorsSkippedTotal: Math.max(0, (Number(data.sponsorsSkippedTotal) || 0) - 1),
    sponsorsSkippedToday: receipt.date === today()
      ? Math.max(0, (Number(data.sponsorsSkippedToday) || 0) - 1)
      : Math.max(0, Number(data.sponsorsSkippedToday) || 0),
    timeSavedTotalSeconds: Math.max(0, (Number(data.timeSavedTotalSeconds) || 0) - receipt.duration),
    categoryStats,
    skipReceipts: receipts
  });
  await updateBadge();
  return { ok: true, receiptId, undone: true };
}

async function broadcastToYouTube(message) {
  try {
    const tabs = await browser.tabs.query({ url: '*://*.youtube.com/*' });
    await Promise.all(tabs.filter(tab => Number.isInteger(tab.id)).map(tab =>
      browser.tabs.sendMessage(tab.id, message).catch(() => null)
    ));
  } catch (error) {
    console.warn('[LoveSpark] Broadcast failed:', error.message);
  }
}

function setTabState(tabId, state) {
  if (Number.isInteger(tabId)) tabState.set(tabId, state);
}

async function handleMessage(message, sender) {
  if (sender?.id && sender.id !== browser.runtime.id) return { ok: false, error: 'invalid-sender' };
  if (!message || typeof message.action !== 'string') return { ok: false, error: 'invalid-message' };
  const tabId = sender?.tab?.id;

  switch (message.action) {
    case 'ping':
      return { ok: true, product: 'lovespark-sponsor-skip', version: browser.runtime.getManifest().version };

    case 'fetchSegments': {
      if (!isValidVideoId(message.videoID)) return { ok: false, status: 'unavailable', segments: [], error: 'invalid-video-id' };
      const enabledData = await browser.storage.local.get('isEnabled');
      if (enabledData.isEnabled === false) return { ok: true, enabled: false, status: 'disabled', segments: [] };
      const requestId = typeof message.requestId === 'string' ? message.requestId.slice(0, 128) : '';
      if (Number.isInteger(tabId)) {
        tabRequest.set(tabId, requestId);
        setTabState(tabId, { videoID: message.videoID, status: 'loading', source: null, segments: [], count: 0 });
      }
      if (await isWhitelisted(message.videoID, message.channelID)) {
        const state = { videoID: message.videoID, status: 'whitelisted', source: null, segments: [], count: 0 };
        if (!Number.isInteger(tabId) || tabRequest.get(tabId) === requestId) setTabState(tabId, state);
        return { ok: true, enabled: true, whitelisted: true, ...state };
      }
      const result = await fetchSegments(message.videoID);
      const modes = await getCategoryModes();
      const annotated = result.segments
        .filter(segment => modes[segment.category] !== 'off')
        .map(segment => ({ ...segment, mode: modes[segment.category] }));
      const status = result.status === 'cached-offline' ? 'cached-offline'
        : result.status === 'unavailable' ? 'unavailable'
          : annotated.length ? 'ready' : 'clean';
      const state = { videoID: message.videoID, status, source: result.source, segments: annotated, count: annotated.length };
      if (!Number.isInteger(tabId) || tabRequest.get(tabId) === requestId) setTabState(tabId, state);
      return { ok: result.ok, enabled: true, whitelisted: false, retryable: result.retryable === true, ...state };
    }

    case 'clearTabState':
      if (Number.isInteger(tabId)) {
        tabRequest.delete(tabId);
        setTabState(tabId, { videoID: null, status: 'non-video', source: null, segments: [], count: 0 });
      }
      return { ok: true };

    case 'reportPageState': {
      if (!Number.isInteger(tabId)) return { ok: false, error: 'missing-tab' };
      const allowedStatuses = new Set([
        'unknown', 'loading', 'disabled', 'whitelisted', 'non-video',
        'clean', 'cached-offline', 'unavailable', 'ready'
      ]);
      const videoID = isValidVideoId(message.videoID) ? message.videoID : null;
      const status = allowedStatuses.has(message.status) ? message.status : 'unknown';
      const validated = validateSegments(message.segments);
      const modes = await getCategoryModes();
      const segments = (validated || []).map(segment => ({ ...segment, mode: modes[segment.category] }));
      setTabState(tabId, {
        videoID,
        status: videoID ? status : (status === 'disabled' ? 'disabled' : 'non-video'),
        source: typeof message.source === 'string' ? message.source.slice(0, 32) : null,
        segments,
        count: segments.length
      });
      return { ok: true };
    }

    case 'skipOccurred':
      return queueStatsMutation(() => recordSkip(message.receiptId, message.category, message.duration));

    case 'undoSkip':
      return queueStatsMutation(() => undoSkip(message.receiptId));

    case 'getStats': {
      const data = await browser.storage.local.get([
        'sponsorsSkippedTotal', 'sponsorsSkippedToday', 'timeSavedTotalSeconds',
        'isEnabled', 'categoryStats', 'categoryModes'
      ]);
      const info = Number.isInteger(message.tabId) ? tabState.get(message.tabId) : null;
      const status = data.isEnabled === false ? 'disabled' : (info?.status || 'unknown');
      return {
        ...data,
        categoryModes: normalizeModes(data.categoryModes, DEFAULT_MODES),
        tabSegmentCount: info?.count ?? null,
        tabVideoID: info?.videoID ?? null,
        tabSegments: info?.segments || [],
        status,
        source: info?.source || null,
        statusPresentation: presentStatus(status, info?.source, info?.count || 0)
      };
    }

    case 'setEnabled': {
      const enabled = message.enabled === true;
      await browser.storage.local.set({ isEnabled: enabled });
      await broadcastToYouTube({ action: 'enabledChanged', enabled });
      await updateBadge();
      return { ok: true };
    }

    case 'updateCategoryModes': {
      const categoryModes = normalizeModes(message.categoryModes, DEFAULT_MODES);
      await browser.storage.local.set({ categoryModes });
      memoryCache.clear();
      await broadcastToYouTube({ action: 'modesChanged', categoryModes });
      return { ok: true, categoryModes };
    }

    case 'resetStats':
      return queueStatsMutation(async () => {
        await browser.storage.local.set({
          sponsorsSkippedTotal: 0,
          sponsorsSkippedToday: 0,
          timeSavedTotalSeconds: 0,
          lastResetDate: today(),
          categoryStats: { ...DEFAULT_CATEGORY_STATS },
          skipReceipts: {}
        });
        await updateBadge();
        return { ok: true };
      });

    case 'getWhitelist':
      return getWhitelists();

    case 'addChannelWhitelist':
      return { ok: await addChannelWhitelist(message.channel) };

    case 'removeChannelWhitelist': {
      if (typeof message.channelID !== 'string') return { ok: false, error: 'invalid-channel' };
      const whitelist = await getWhitelists();
      await browser.storage.local.set({ whitelistedChannels: whitelist.channels.filter(channel => channel.id !== message.channelID) });
      return { ok: true };
    }

    case 'addVideoWhitelist':
      return { ok: await addVideoWhitelist(message.videoID) };

    case 'removeVideoWhitelist': {
      if (!isValidVideoId(message.videoID)) return { ok: false, error: 'invalid-video-id' };
      const whitelist = await getWhitelists();
      await browser.storage.local.set({ whitelistedVideos: whitelist.videos.filter(videoID => videoID !== message.videoID) });
      return { ok: true };
    }

    case 'isWhitelisted':
      return { whitelisted: await isWhitelisted(message.videoID, message.channelID) };

    default:
      return { ok: false, error: 'unknown-action' };
  }
}

browser.runtime.onMessage.addListener((message, sender) =>
  handleMessage(message, sender).catch(error => {
    console.error('[LoveSpark] Background message failed:', error);
    return { ok: false, status: 'unavailable', error: 'internal-error' };
  })
);

browser.commands.onCommand.addListener(async command => {
  if (command === 'toggle-skip') {
    const data = await browser.storage.local.get('isEnabled');
    await handleMessage({ action: 'setEnabled', enabled: data.isEnabled === false }, { id: browser.runtime.id });
  } else if (command === 'whitelist-channel') {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!Number.isInteger(tab?.id)) return;
      const info = await browser.tabs.sendMessage(tab.id, { action: 'getChannelInfo' });
      if (isValidChannel(info)) {
        await addChannelWhitelist(info);
        await browser.tabs.sendMessage(tab.id, { action: 'channelWhitelisted' }).catch(() => null);
      }
    } catch (error) {
      console.warn('[LoveSpark] Channel shortcut unavailable:', error.message);
    }
  }
});

async function initStorage() {
  const data = await browser.storage.local.get(null);
  const updates = {};
  if (data.schemaVersion !== SCHEMA_VERSION) updates.schemaVersion = SCHEMA_VERSION;
  if (data.sponsorsSkippedTotal === undefined) updates.sponsorsSkippedTotal = 0;
  if (data.sponsorsSkippedToday === undefined) updates.sponsorsSkippedToday = 0;
  if (data.timeSavedTotalSeconds === undefined) updates.timeSavedTotalSeconds = 0;
  if (data.lastResetDate === undefined) updates.lastResetDate = today();
  if (data.isEnabled === undefined) updates.isEnabled = true;
  if (data.categoryStats === undefined) updates.categoryStats = { ...DEFAULT_CATEGORY_STATS };
  if (data.whitelistedChannels === undefined) updates.whitelistedChannels = [];
  if (data.whitelistedVideos === undefined) updates.whitelistedVideos = [];
  if (data.skipReceipts === undefined) updates.skipReceipts = {};
  if (data.categories && !data.categoryModes) {
    updates.categoryModes = normalizeModes(
      Object.fromEntries(CATEGORIES.map(category => [category, data.categories[category] ? 'auto' : undefined])),
      DEFAULT_MODES
    );
  } else if (!data.categoryModes) {
    updates.categoryModes = { ...DEFAULT_MODES };
  }
  if (data.lastResetDate && data.lastResetDate !== today()) {
    updates.sponsorsSkippedToday = 0;
    updates.lastResetDate = today();
  }
  if (Object.keys(updates).length) await browser.storage.local.set(updates);
  await purgePrivateLegacyData();
  await updateBadge();
}

browser.runtime.onInstalled.addListener(() => initStorage().catch(console.error));
browser.runtime.onStartup.addListener(() => initStorage().catch(console.error));
browser.tabs.onRemoved.addListener(tabId => {
  tabState.delete(tabId);
  tabRequest.delete(tabId);
});
initStorage().catch(error => console.error('[LoveSpark] Initialization failed:', error));
