// YouTube Sponsor Skip v2 — settings.js
'use strict';

// Dark mode
browser.storage.local.get(['darkMode']).then(({ darkMode }) => {
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  const btn = document.getElementById('btnDarkMode');
  if (btn) btn.textContent = darkMode ? '☀️' : '🌙';
});
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  browser.storage.local.set({ darkMode: !isDark });
  const btn = document.getElementById('btnDarkMode');
  if (btn) btn.textContent = isDark ? '🌙' : '☀️';
}
document.getElementById('btnDarkMode').addEventListener('click', toggleTheme);

const ALL_CATEGORIES = [
  'sponsor', 'selfpromo', 'interaction', 'intro',
  'outro', 'preview', 'music_offtopic', 'filler'
];

// ── DOM refs ────────────────────────────────────────────────────────────────

const masterToggle  = document.getElementById('toggle-enabled');
const channelList   = document.getElementById('channel-list');
const videoList     = document.getElementById('video-list');
const noChannels    = document.getElementById('no-channels');
const noVideos      = document.getElementById('no-videos');
const resetBtn      = document.getElementById('reset-stats');

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeSaved(seconds) {
  if (!seconds || seconds < 1) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Load category modes ─────────────────────────────────────────────────────

function loadModes(modes) {
  document.querySelectorAll('.mode-select').forEach(select => {
    const cat = select.dataset.cat;
    if (modes[cat]) select.value = modes[cat];
  });
}

function saveModes() {
  const modes = {};
  document.querySelectorAll('.mode-select').forEach(select => {
    modes[select.dataset.cat] = select.value;
  });
  browser.runtime.sendMessage({ action: 'updateCategoryModes', categoryModes: modes }).catch(() => {});
}

document.querySelectorAll('.mode-select').forEach(select => {
  select.addEventListener('change', saveModes);
});

// ── Whitelist rendering ─────────────────────────────────────────────────────

function renderChannels(channels) {
  channelList.querySelectorAll('.whitelist-item').forEach(el => el.remove());

  if (!channels || channels.length === 0) {
    noChannels.style.display = '';
    return;
  }

  noChannels.style.display = 'none';

  for (const ch of channels) {
    const item = document.createElement('div');
    item.className = 'whitelist-item';

    const name = document.createElement('span');
    name.className = 'whitelist-name';
    name.textContent = ch.name || ch.id;

    const btn = document.createElement('button');
    btn.className = 'whitelist-remove';
    btn.textContent = '✕';
    btn.setAttribute('aria-label', `Remove ${ch.name || ch.id}`);
    btn.addEventListener('click', () => {
      browser.runtime.sendMessage({ action: 'removeChannelWhitelist', channelID: ch.id }).then(loadWhitelists).catch(() => {});
    });

    item.appendChild(name);
    item.appendChild(btn);
    channelList.appendChild(item);
  }
}

function renderVideos(videos) {
  videoList.querySelectorAll('.whitelist-item').forEach(el => el.remove());

  if (!videos || videos.length === 0) {
    noVideos.style.display = '';
    return;
  }

  noVideos.style.display = 'none';

  for (const vid of videos) {
    const item = document.createElement('div');
    item.className = 'whitelist-item';

    const name = document.createElement('span');
    name.className = 'whitelist-name';
    name.textContent = vid;

    const btn = document.createElement('button');
    btn.className = 'whitelist-remove';
    btn.textContent = '✕';
    btn.setAttribute('aria-label', `Remove ${vid}`);
    btn.addEventListener('click', () => {
      browser.runtime.sendMessage({ action: 'removeVideoWhitelist', videoID: vid }).then(loadWhitelists).catch(() => {});
    });

    item.appendChild(name);
    item.appendChild(btn);
    videoList.appendChild(item);
  }
}

async function loadWhitelists() {
  try {
    const data = await browser.runtime.sendMessage({ action: 'getWhitelist' });
    if (!data) return;
    renderChannels(data.channels || []);
    renderVideos(data.videos || []);
  } catch (err) { console.warn('[lovespark-sponsor-skip] unknown:', err); }
}

// ── Load stats ──────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const data = await browser.runtime.sendMessage({ action: 'getStats', tabId: null });
    if (!data) return;

    // Master toggle
    masterToggle.checked = data.isEnabled !== false;

    // Category modes
    loadModes(data.categoryModes || {});

    // Stats
    document.getElementById('stat-today').textContent = data.sponsorsSkippedToday || 0;
    document.getElementById('stat-total').textContent = data.sponsorsSkippedTotal || 0;
    document.getElementById('stat-time').textContent = formatTimeSaved(data.timeSavedTotalSeconds || 0);

    // Per-category stats
    const catStats = data.categoryStats || {};
    for (const cat of ALL_CATEGORIES) {
      const el = document.getElementById(`cat-${cat}`);
      if (el) el.textContent = catStats[cat] || 0;
    }
  } catch (err) { console.warn('[lovespark-sponsor-skip] unknown:', err); }
}

// ── Master toggle ───────────────────────────────────────────────────────────

masterToggle.addEventListener('change', () => {
  browser.runtime.sendMessage({ action: 'setEnabled', enabled: masterToggle.checked }).catch(() => {});
});

// ── Reset stats ─────────────────────────────────────────────────────────────

resetBtn.addEventListener('click', async () => {
  const confirmed = confirm('Reset all stats? This cannot be undone.');
  if (!confirmed) return;

  await browser.runtime.sendMessage({ action: 'resetStats' });

  document.getElementById('stat-today').textContent = '0';
  document.getElementById('stat-total').textContent = '0';
  document.getElementById('stat-time').textContent = '—';

  for (const cat of ALL_CATEGORIES) {
    const el = document.getElementById(`cat-${cat}`);
    if (el) el.textContent = '0';
  }
});

// ── Init ────────────────────────────────────────────────────────────────────

loadStats();
loadWhitelists();
