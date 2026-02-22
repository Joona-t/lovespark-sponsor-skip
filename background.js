// LoveSpark Sponsor Skip — background.js (Service Worker)
'use strict';

// ── In-memory cache: videoID → {segments, timestamp} ──────────────────────
const segmentCache = new Map();
const CACHE_TTL_MS = 3_600_000; // 1 hour

// ── In-memory tab state: tabId → {videoID, count} ─────────────────────────
const tabSegments = new Map();

// ── Default categories ─────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = {
  sponsor: true,
  selfpromo: true,
  interaction: true,
  intro: false,
  outro: false,
  music_offtopic: false
};

const DEFAULT_CATEGORY_STATS = {
  sponsor: 0,
  selfpromo: 0,
  interaction: 0,
  intro: 0,
  outro: 0,
  music_offtopic: 0
};

// ── SHA-256 helper ──────────────────────────────────────────────────────────

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Get enabled categories from storage ────────────────────────────────────

async function getEnabledCategories() {
  const data = await chrome.storage.local.get('categories');
  const cats = data.categories || DEFAULT_CATEGORIES;
  return Object.keys(cats).filter(k => cats[k]);
}

// ── Fetch segments from SponsorBlock (privacy-preserving hashed lookup) ────

async function fetchSegments(videoID) {
  // Check in-memory cache first
  const cached = segmentCache.get(videoID);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.segments;
  }

  const enabledCategories = await getEnabledCategories();
  if (enabledCategories.length === 0) return [];

  try {
    const hash = await sha256(videoID);
    const prefix = hash.substring(0, 4);
    const url = `https://sponsor.ajay.app/api/skipSegments/${prefix}?categories=${encodeURIComponent(JSON.stringify(enabledCategories))}`;

    const response = await fetch(url);

    if (response.status === 404) {
      // No segments for this hash prefix — totally normal
      segmentCache.set(videoID, { segments: [], timestamp: Date.now() });
      return [];
    }

    if (!response.ok) {
      throw new Error(`SponsorBlock API returned ${response.status}`);
    }

    const allResults = await response.json();
    // Hashed endpoint may return multiple videos — find ours
    const match = allResults.find(r => r.videoID === videoID);
    const segments = match ? match.segments : [];

    segmentCache.set(videoID, { segments, timestamp: Date.now() });
    return segments;

  } catch (error) {
    console.error('[LoveSpark Sponsor Skip] API error:', error.message);
    return []; // Fail silently — never break the video experience
  }
}

// ── Badge update ────────────────────────────────────────────────────────────

async function updateBadge() {
  const data = await chrome.storage.local.get(['sponsorsSkippedToday', 'isEnabled']);

  if (data.isEnabled === false) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#666666' });
    return;
  }

  const count = data.sponsorsSkippedToday || 0;
  const text = count > 999 ? '999+' : count > 0 ? String(count) : '';
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: '#FF69B4' });
  chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
}

// ── Storage initialization ──────────────────────────────────────────────────

async function initStorage() {
  const data = await chrome.storage.local.get([
    'sponsorsSkippedTotal', 'sponsorsSkippedToday',
    'timeSavedTotalSeconds', 'lastResetDate',
    'isEnabled', 'categories', 'categoryStats', 'whitelistedChannels'
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const defaults = {};

  if (data.sponsorsSkippedTotal === undefined) defaults.sponsorsSkippedTotal = 0;
  if (data.sponsorsSkippedToday === undefined) defaults.sponsorsSkippedToday = 0;
  if (data.timeSavedTotalSeconds === undefined) defaults.timeSavedTotalSeconds = 0;
  if (data.lastResetDate === undefined) defaults.lastResetDate = today;
  if (data.isEnabled === undefined) defaults.isEnabled = true;
  if (data.categories === undefined) defaults.categories = { ...DEFAULT_CATEGORIES };
  if (data.categoryStats === undefined) defaults.categoryStats = { ...DEFAULT_CATEGORY_STATS };
  if (data.whitelistedChannels === undefined) defaults.whitelistedChannels = [];

  // Daily reset
  if (data.lastResetDate && data.lastResetDate !== today) {
    defaults.sponsorsSkippedToday = 0;
    defaults.lastResetDate = today;
  }

  if (Object.keys(defaults).length > 0) {
    await chrome.storage.local.set(defaults);
  }

  await updateBadge();
}

// ── Increment stats when a skip actually occurs ─────────────────────────────

async function recordSkip(category, durationSeconds) {
  const data = await chrome.storage.local.get([
    'sponsorsSkippedTotal', 'sponsorsSkippedToday',
    'timeSavedTotalSeconds', 'lastResetDate', 'categoryStats'
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const updates = {};

  // Daily reset if needed
  if (data.lastResetDate !== today) {
    updates.sponsorsSkippedToday = 0;
    updates.lastResetDate = today;
  }

  updates.sponsorsSkippedTotal = (data.sponsorsSkippedTotal || 0) + 1;
  updates.sponsorsSkippedToday = (updates.sponsorsSkippedToday !== undefined
    ? updates.sponsorsSkippedToday
    : (data.sponsorsSkippedToday || 0)) + 1;
  updates.timeSavedTotalSeconds = (data.timeSavedTotalSeconds || 0) + Math.round(durationSeconds);

  // Per-category stats
  const catStats = { ...(data.categoryStats || DEFAULT_CATEGORY_STATS) };
  if (category in catStats) {
    catStats[category] = (catStats[category] || 0) + 1;
  }
  updates.categoryStats = catStats;

  await chrome.storage.local.set(updates);
  await updateBadge();
}

// ── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.action) {

      case 'fetchSegments': {
        const { videoID } = message;
        const tabId = sender.tab?.id;

        const data = await chrome.storage.local.get('isEnabled');
        const enabled = data.isEnabled !== false;

        if (!videoID || !enabled) {
          if (tabId) tabSegments.set(tabId, { videoID: videoID || null, count: 0 });
          sendResponse({ segments: [], enabled });
          break;
        }

        const segments = await fetchSegments(videoID);

        // Filter to enabled categories
        const cats = await chrome.storage.local.get('categories');
        const enabledCats = cats.categories || DEFAULT_CATEGORIES;
        const filtered = segments.filter(s => enabledCats[s.category] === true);

        if (tabId) tabSegments.set(tabId, { videoID, count: filtered.length });
        sendResponse({ segments: filtered, enabled: true });
        break;
      }

      case 'skipOccurred': {
        const { category, duration } = message;
        await recordSkip(category, duration || 0);
        sendResponse({ ok: true });
        break;
      }

      case 'getStats': {
        const { tabId } = message;
        const storageData = await chrome.storage.local.get([
          'sponsorsSkippedTotal', 'sponsorsSkippedToday',
          'timeSavedTotalSeconds', 'isEnabled', 'categoryStats'
        ]);

        const tabInfo = tabId ? (tabSegments.get(tabId) || null) : null;

        sendResponse({
          ...storageData,
          tabSegmentCount: tabInfo ? tabInfo.count : null,
          tabVideoID: tabInfo ? tabInfo.videoID : null
        });
        break;
      }

      case 'setEnabled': {
        const { enabled } = message;
        await chrome.storage.local.set({ isEnabled: enabled });

        // Notify all youtube content scripts
        try {
          const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                action: 'enabledChanged',
                enabled
              }).catch(() => {});
            }
          }
        } catch (e) {}

        await updateBadge();
        sendResponse({ ok: true });
        break;
      }

      case 'updateCategories': {
        const { categories } = message;
        await chrome.storage.local.set({ categories });
        // Clear cache so next video load uses new categories
        segmentCache.clear();
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

      default:
        sendResponse({ ok: false, error: 'Unknown action' });
    }
  })();

  return true; // Keep channel open for async response
});

// ── Startup ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(initStorage);
chrome.runtime.onStartup.addListener(initStorage);

// Clean up tab state when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  tabSegments.delete(tabId);
});

// Run on service worker boot
initStorage();
