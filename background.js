// LoveSpark Sponsor Skip v2 — background.js (Service Worker)
'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const SCHEMA_VERSION = 2;
const MEMORY_CACHE_TTL = 3_600_000;  // 1 hour in-memory
const STORAGE_CACHE_TTL = 86_400_000; // 24 hours persistent
const BADGE_COLOR = '#ff6eb4';

const ALL_CATEGORIES = [
  'sponsor', 'selfpromo', 'interaction', 'intro',
  'outro', 'preview', 'music_offtopic', 'filler'
];

const DEFAULT_MODES = {
  sponsor:        'auto',
  selfpromo:      'auto',
  interaction:    'auto',
  intro:          'highlight',
  outro:          'highlight',
  preview:        'highlight',
  music_offtopic: 'auto',
  filler:         'highlight'
};

const DEFAULT_CATEGORY_STATS = Object.fromEntries(ALL_CATEGORIES.map(c => [c, 0]));

const CATEGORY_LABELS = {
  sponsor:        'Sponsor',
  selfpromo:      'Self-Promo',
  interaction:    'Interaction',
  intro:          'Intro',
  outro:          'Outro',
  preview:        'Preview',
  music_offtopic: 'Non-Music',
  filler:         'Filler'
};

// ── In-memory state ──────────────────────────────────────────────────────────

const segmentCache = new Map(); // videoID → {segments, timestamp}
const tabSegments  = new Map(); // tabId → {videoID, count, segments}

// ── SHA-256 helper ───────────────────────────────────────────────────────────

async function sha256(message) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Persistent segment cache ─────────────────────────────────────────────────

async function getCachedSegments(videoID) {
  const key = `cache_${videoID}`;
  const data = await chrome.storage.local.get(key);
  if (!data[key]) return null;
  if (Date.now() - data[key].fetchedAt > STORAGE_CACHE_TTL) {
    chrome.storage.local.remove(key);
    return null;
  }
  return data[key].segments;
}

async function setCachedSegments(videoID, segments) {
  await chrome.storage.local.set({
    [`cache_${videoID}`]: { segments, fetchedAt: Date.now() }
  });
}

async function purgeExpiredCaches() {
  const all = await chrome.storage.local.get(null);
  const expired = Object.keys(all).filter(k =>
    k.startsWith('cache_') && Date.now() - (all[k].fetchedAt || 0) > STORAGE_CACHE_TTL
  );
  if (expired.length) await chrome.storage.local.remove(expired);
}

// ── Get category modes from storage ──────────────────────────────────────────

async function getCategoryModes() {
  const data = await chrome.storage.local.get('categoryModes');
  return { ...DEFAULT_MODES, ...(data.categoryModes || {}) };
}

function getActiveCategories(modes) {
  return ALL_CATEGORIES.filter(c => modes[c] !== 'off');
}

// ── Fetch segments (memory → storage → API → fallback) ──────────────────────

async function fetchSegments(videoID) {
  // 1. Memory cache
  const mem = segmentCache.get(videoID);
  if (mem && Date.now() - mem.timestamp < MEMORY_CACHE_TTL) return mem.segments;

  const modes = await getCategoryModes();
  const active = getActiveCategories(modes);
  if (active.length === 0) return [];

  // 2. Try API
  let segments = null;
  try {
    const hash = await sha256(videoID);
    const prefix = hash.substring(0, 4);
    const url = `https://sponsor.ajay.app/api/skipSegments/${prefix}?categories=${encodeURIComponent(JSON.stringify(active))}`;
    const response = await fetch(url);

    if (response.status === 404) {
      segments = [];
    } else if (response.ok) {
      const allResults = await response.json();
      const match = allResults.find(r => r.videoID === videoID);
      segments = match ? match.segments : [];
    }
  } catch (e) {
    console.warn('[LoveSpark] SponsorBlock API error:', e.message);
  }

  // 3. API succeeded — cache and return
  if (segments !== null) {
    segmentCache.set(videoID, { segments, timestamp: Date.now() });
    setCachedSegments(videoID, segments);
    return segments;
  }

  // 4. API failed — try persistent cache
  const stored = await getCachedSegments(videoID);
  if (stored) {
    segmentCache.set(videoID, { segments: stored, timestamp: Date.now() });
    return stored;
  }

  // 5. Everything failed
  return [];
}

// ── Badge ────────────────────────────────────────────────────────────────────

function formatTimeBadge(totalSeconds) {
  if (totalSeconds >= 3600) return `${Math.floor(totalSeconds / 3600)}h`;
  if (totalSeconds >= 60) return `${Math.floor(totalSeconds / 60)}m`;
  if (totalSeconds > 0) return `${totalSeconds}s`;
  return '';
}

async function updateBadge() {
  const data = await chrome.storage.local.get(['timeSavedTotalSeconds', 'isEnabled']);

  if (data.isEnabled === false) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#666666' });
    return;
  }

  const text = formatTimeBadge(data.timeSavedTotalSeconds || 0);
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
}

// ── Whitelist helpers ────────────────────────────────────────────────────────

async function getWhitelists() {
  const data = await chrome.storage.local.get(['whitelistedChannels', 'whitelistedVideos']);
  return {
    channels: data.whitelistedChannels || [],
    videos: data.whitelistedVideos || []
  };
}

async function isWhitelisted(videoID, channelID) {
  const wl = await getWhitelists();
  if (videoID && wl.videos.includes(videoID)) return true;
  if (channelID && wl.channels.some(c => c.id === channelID)) return true;
  return false;
}

async function addChannelWhitelist(channel) {
  const wl = await getWhitelists();
  if (wl.channels.some(c => c.id === channel.id)) return;
  wl.channels.push(channel);
  await chrome.storage.local.set({ whitelistedChannels: wl.channels });
}

async function removeChannelWhitelist(channelID) {
  const wl = await getWhitelists();
  await chrome.storage.local.set({
    whitelistedChannels: wl.channels.filter(c => c.id !== channelID)
  });
}

async function addVideoWhitelist(videoID) {
  const wl = await getWhitelists();
  if (wl.videos.includes(videoID)) return;
  wl.videos.push(videoID);
  await chrome.storage.local.set({ whitelistedVideos: wl.videos });
}

async function removeVideoWhitelist(videoID) {
  const wl = await getWhitelists();
  await chrome.storage.local.set({
    whitelistedVideos: wl.videos.filter(v => v !== videoID)
  });
}

// ── Storage init & migration ─────────────────────────────────────────────────

async function initStorage() {
  const data = await chrome.storage.local.get(null);
  const today = new Date().toISOString().slice(0, 10);
  const updates = {};

  // Migrate v1 → v2
  if (data.schemaVersion !== SCHEMA_VERSION) {
    // Convert old boolean categories to mode strings
    if (data.categories && !data.categoryModes) {
      const modes = {};
      for (const cat of ALL_CATEGORIES) {
        if (cat in data.categories) {
          modes[cat] = data.categories[cat] ? 'auto' : 'off';
        } else {
          modes[cat] = DEFAULT_MODES[cat];
        }
      }
      updates.categoryModes = modes;
    }
    updates.schemaVersion = SCHEMA_VERSION;
  }

  // Set defaults for missing keys
  if (data.sponsorsSkippedTotal === undefined) updates.sponsorsSkippedTotal = 0;
  if (data.sponsorsSkippedToday === undefined) updates.sponsorsSkippedToday = 0;
  if (data.timeSavedTotalSeconds === undefined) updates.timeSavedTotalSeconds = 0;
  if (data.lastResetDate === undefined) updates.lastResetDate = today;
  if (data.isEnabled === undefined) updates.isEnabled = true;
  if (!data.categoryModes && !updates.categoryModes) updates.categoryModes = { ...DEFAULT_MODES };
  if (data.categoryStats === undefined) updates.categoryStats = { ...DEFAULT_CATEGORY_STATS };
  if (data.whitelistedChannels === undefined) updates.whitelistedChannels = [];
  if (data.whitelistedVideos === undefined) updates.whitelistedVideos = [];

  // Daily reset
  if (data.lastResetDate && data.lastResetDate !== today) {
    updates.sponsorsSkippedToday = 0;
    updates.lastResetDate = today;
    purgeExpiredCaches();
  }

  if (Object.keys(updates).length > 0) await chrome.storage.local.set(updates);
  await updateBadge();
}

// ── Record a skip ────────────────────────────────────────────────────────────

async function recordSkip(category, durationSeconds) {
  const data = await chrome.storage.local.get([
    'sponsorsSkippedTotal', 'sponsorsSkippedToday',
    'timeSavedTotalSeconds', 'lastResetDate', 'categoryStats'
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const updates = {};

  if (data.lastResetDate !== today) {
    updates.sponsorsSkippedToday = 0;
    updates.lastResetDate = today;
  }

  updates.sponsorsSkippedTotal = (data.sponsorsSkippedTotal || 0) + 1;
  updates.sponsorsSkippedToday = (updates.sponsorsSkippedToday !== undefined
    ? updates.sponsorsSkippedToday
    : (data.sponsorsSkippedToday || 0)) + 1;
  updates.timeSavedTotalSeconds = (data.timeSavedTotalSeconds || 0) + Math.round(durationSeconds);

  const catStats = { ...DEFAULT_CATEGORY_STATS, ...(data.categoryStats || {}) };
  if (category in catStats) catStats[category] = (catStats[category] || 0) + 1;
  updates.categoryStats = catStats;

  await chrome.storage.local.set(updates);
  await updateBadge();
}

// ── Broadcast to all YouTube tabs ────────────────────────────────────────────

async function broadcastToYouTube(message) {
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    for (const tab of tabs) {
      if (tab.id) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  } catch (e) {}
}

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.action) {

      case 'fetchSegments': {
        const { videoID, channelID } = message;
        const tabId = sender.tab?.id;

        const data = await chrome.storage.local.get('isEnabled');
        if (!videoID || data.isEnabled === false) {
          if (tabId) tabSegments.set(tabId, { videoID: videoID || null, count: 0, segments: [] });
          sendResponse({ segments: [], enabled: data.isEnabled !== false });
          break;
        }

        // Whitelist check
        const whitelisted = await isWhitelisted(videoID, channelID);
        if (whitelisted) {
          if (tabId) tabSegments.set(tabId, { videoID, count: 0, segments: [] });
          sendResponse({ segments: [], enabled: true, whitelisted: true });
          break;
        }

        const segments = await fetchSegments(videoID);
        const modes = await getCategoryModes();

        // Annotate each segment with its mode
        const annotated = segments
          .filter(s => modes[s.category] !== 'off')
          .map(s => ({
            segment: s.segment,
            category: s.category,
            UUID: s.UUID,
            mode: modes[s.category] || 'off'
          }));

        if (tabId) tabSegments.set(tabId, { videoID, count: annotated.length, segments: annotated });
        sendResponse({ segments: annotated, enabled: true, whitelisted: false });
        break;
      }

      case 'skipOccurred': {
        await recordSkip(message.category, message.duration || 0);
        sendResponse({ ok: true });
        break;
      }

      case 'getStats': {
        const { tabId } = message;
        const storageData = await chrome.storage.local.get([
          'sponsorsSkippedTotal', 'sponsorsSkippedToday',
          'timeSavedTotalSeconds', 'isEnabled', 'categoryStats', 'categoryModes'
        ]);
        const tabInfo = tabId ? (tabSegments.get(tabId) || null) : null;

        sendResponse({
          ...storageData,
          categoryModes: storageData.categoryModes || DEFAULT_MODES,
          tabSegmentCount: tabInfo ? tabInfo.count : null,
          tabVideoID: tabInfo ? tabInfo.videoID : null,
          tabSegments: tabInfo ? tabInfo.segments : []
        });
        break;
      }

      case 'setEnabled': {
        await chrome.storage.local.set({ isEnabled: message.enabled });
        await broadcastToYouTube({ action: 'enabledChanged', enabled: message.enabled });
        await updateBadge();
        sendResponse({ ok: true });
        break;
      }

      case 'updateCategoryModes': {
        await chrome.storage.local.set({ categoryModes: message.categoryModes });
        segmentCache.clear();
        await broadcastToYouTube({ action: 'modesChanged', categoryModes: message.categoryModes });
        sendResponse({ ok: true });
        break;
      }

      case 'resetStats': {
        const today = new Date().toISOString().slice(0, 10);
        await chrome.storage.local.set({
          sponsorsSkippedTotal: 0,
          sponsorsSkippedToday: 0,
          timeSavedTotalSeconds: 0,
          lastResetDate: today,
          categoryStats: { ...DEFAULT_CATEGORY_STATS }
        });
        await updateBadge();
        sendResponse({ ok: true });
        break;
      }

      // Whitelist operations
      case 'getWhitelist': {
        const wl = await getWhitelists();
        sendResponse(wl);
        break;
      }

      case 'addChannelWhitelist': {
        await addChannelWhitelist(message.channel);
        sendResponse({ ok: true });
        break;
      }

      case 'removeChannelWhitelist': {
        await removeChannelWhitelist(message.channelID);
        sendResponse({ ok: true });
        break;
      }

      case 'addVideoWhitelist': {
        await addVideoWhitelist(message.videoID);
        sendResponse({ ok: true });
        break;
      }

      case 'removeVideoWhitelist': {
        await removeVideoWhitelist(message.videoID);
        sendResponse({ ok: true });
        break;
      }

      case 'isWhitelisted': {
        const result = await isWhitelisted(message.videoID, message.channelID);
        sendResponse({ whitelisted: result });
        break;
      }

      default:
        sendResponse({ ok: false, error: 'Unknown action' });
    }
  })();

  return true;
});

// ── Keyboard shortcut handlers ───────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-skip') {
    const data = await chrome.storage.local.get('isEnabled');
    const newState = data.isEnabled === false;
    await chrome.storage.local.set({ isEnabled: newState });
    await broadcastToYouTube({ action: 'enabledChanged', enabled: newState });
    await updateBadge();
  }

  if (command === 'whitelist-channel') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'getChannelInfo' }, async (info) => {
          if (info?.id) {
            await addChannelWhitelist(info);
            chrome.tabs.sendMessage(tab.id, { action: 'channelWhitelisted' }).catch(() => {});
          }
        });
      }
    } catch (e) {}
  }
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(initStorage);
chrome.runtime.onStartup.addListener(initStorage);
chrome.tabs.onRemoved.addListener((tabId) => tabSegments.delete(tabId));
initStorage();
