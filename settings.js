// LoveSpark Sponsor Skip — settings.js
'use strict';

// ── Format time saved ────────────────────────────────────────────────────────

function formatTimeSaved(seconds) {
  if (!seconds || seconds < 1) return '< 1 min';
  if (seconds < 3600) {
    const mins = Math.round(seconds / 60);
    return mins < 1 ? '< 1 min' : `${mins} min`;
  }
  const hours = (seconds / 3600).toFixed(1);
  return `${hours}h`;
}

// ── Load and render all settings ─────────────────────────────────────────────

async function loadSettings() {
  const data = await chrome.storage.local.get([
    'isEnabled', 'categories',
    'sponsorsSkippedToday', 'sponsorsSkippedTotal',
    'timeSavedTotalSeconds', 'categoryStats'
  ]);

  // Master toggle
  const masterToggle = document.getElementById('toggle-enabled');
  masterToggle.checked = data.isEnabled !== false;

  // Category toggles
  const cats = data.categories || {
    sponsor: true, selfpromo: true, interaction: true,
    intro: false, outro: false, music_offtopic: false
  };
  document.querySelectorAll('[data-category]').forEach(input => {
    const cat = input.dataset.category;
    if (cat in cats) input.checked = cats[cat];
  });

  // Stats
  document.getElementById('stat-today').textContent =
    data.sponsorsSkippedToday || 0;
  document.getElementById('stat-total').textContent =
    data.sponsorsSkippedTotal || 0;
  document.getElementById('stat-time').textContent =
    formatTimeSaved(data.timeSavedTotalSeconds || 0);

  // Per-category stats
  const catStats = data.categoryStats || {};
  const catIDs = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'music_offtopic'];
  for (const cat of catIDs) {
    const el = document.getElementById(`cat-${cat}`);
    if (el) el.textContent = catStats[cat] || 0;
  }
}

// ── Save categories to storage ────────────────────────────────────────────────

async function saveCategories() {
  const categories = {};
  document.querySelectorAll('[data-category]').forEach(input => {
    categories[input.dataset.category] = input.checked;
  });
  await chrome.storage.local.set({ categories });
  // Notify background to clear cache
  chrome.runtime.sendMessage({ action: 'updateCategories', categories }).catch(() => {});
}

// ── Event listeners ───────────────────────────────────────────────────────────

// Master enable toggle
document.getElementById('toggle-enabled').addEventListener('change', function () {
  chrome.runtime.sendMessage({ action: 'setEnabled', enabled: this.checked }).catch(() => {});
});

// Category toggles — save on any change
document.querySelectorAll('[data-category]').forEach(input => {
  input.addEventListener('change', saveCategories);
});

// Reset stats
document.getElementById('reset-stats').addEventListener('click', async () => {
  const confirmed = confirm('Reset all stats? This cannot be undone.');
  if (!confirmed) return;

  await chrome.runtime.sendMessage({ action: 'resetStats' });

  // Refresh displayed stats
  document.getElementById('stat-today').textContent = '0';
  document.getElementById('stat-total').textContent = '0';
  document.getElementById('stat-time').textContent = '< 1 min';

  const catIDs = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'music_offtopic'];
  for (const cat of catIDs) {
    const el = document.getElementById(`cat-${cat}`);
    if (el) el.textContent = '0';
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

loadSettings();
