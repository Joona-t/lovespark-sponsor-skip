// LoveSpark Sponsor Skip v2 — popup.js
'use strict';

// Dark mode
chrome.storage.local.get(['darkMode'], ({ darkMode }) => {
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  const btn = document.getElementById('btnDarkMode');
  if (btn) btn.textContent = darkMode ? '☀️' : '🌙';
});
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  chrome.storage.local.set({ darkMode: !isDark });
  const btn = document.getElementById('btnDarkMode');
  if (btn) btn.textContent = isDark ? '🌙' : '☀️';
}
document.getElementById('btnDarkMode').addEventListener('click', toggleTheme);

const CATEGORY_ICONS = {
  sponsor: '💰', selfpromo: '🛍️', interaction: '👍', intro: '🎬',
  outro: '🎞️', preview: '⏭️', music_offtopic: '🎵', filler: '💬'
};

const CATEGORY_LABELS = {
  sponsor: 'Sponsor', selfpromo: 'Self-Promo', interaction: 'Interaction',
  intro: 'Intro', outro: 'Outro', preview: 'Preview',
  music_offtopic: 'Non-Music', filler: 'Filler'
};

const MESSAGES = [
  'Sponsor-free vibes! 💕',
  'Your time is valuable! ✨',
  'Skipped with love! 🌸',
  'Browse in peace! 💖',
  'No sponsors here, bestie! 💕'
];

// ── DOM refs ─────────────────────────────────────────────────────────────────

const elToday      = document.getElementById('val-today');
const elTotal      = document.getElementById('val-total');
const elTime       = document.getElementById('val-time');
const segmentList  = document.getElementById('segment-list');
const emptyState   = document.getElementById('empty-state');
const toggle       = document.getElementById('toggle-enabled');
const settingsBtn  = document.getElementById('settings-btn');
const footerMsg    = document.getElementById('footer-message');

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeSaved(seconds) {
  if (!seconds || seconds < 1) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function animateTo(el, target) {
  const start = parseInt(el.textContent, 10) || 0;
  if (start === target) return;
  const diff = target - start;
  const steps = Math.min(Math.abs(diff), 20);
  const stepSize = diff / steps;
  let current = start;
  let step = 0;
  const interval = setInterval(() => {
    step++;
    current += stepSize;
    el.textContent = Math.round(current);
    if (step >= steps) {
      clearInterval(interval);
      el.textContent = target;
      el.classList.add('ticked');
      el.addEventListener('animationend', function handler() {
        el.classList.remove('ticked');
        el.removeEventListener('animationend', handler);
      });
    }
  }, 18);
}

// ── Collapsible sections ─────────────────────────────────────────────────────

document.querySelectorAll('.group-header').forEach(btn => {
  btn.addEventListener('click', () => {
    const group = btn.dataset.group;
    const body = document.getElementById(`group-${group}`);
    const chevron = btn.querySelector('.group-chevron');
    const expanded = btn.getAttribute('aria-expanded') === 'true';

    btn.setAttribute('aria-expanded', !expanded);
    body.classList.toggle('collapsed', expanded);
    chevron.textContent = expanded ? '▸' : '▾';
  });
});

// ── Render segment list ──────────────────────────────────────────────────────

function renderSegments(segments) {
  // Clear existing items (keep empty-state node)
  segmentList.querySelectorAll('.segment-item').forEach(el => el.remove());

  if (!segments || segments.length === 0) {
    emptyState.style.display = '';
    return;
  }

  emptyState.style.display = 'none';

  for (const seg of segments) {
    const [start, end] = seg.segment;
    const icon = CATEGORY_ICONS[seg.category] || '•';
    const label = CATEGORY_LABELS[seg.category] || seg.category;

    const item = document.createElement('div');
    item.className = 'segment-item';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'segment-icon';
    iconSpan.textContent = icon;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'segment-name';
    nameSpan.textContent = label;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'segment-time';
    timeSpan.textContent = `${formatTime(start)}–${formatTime(end)}`;

    item.appendChild(iconSpan);
    item.appendChild(nameSpan);
    item.appendChild(timeSpan);
    segmentList.appendChild(item);
  }
}

// ── Load mode selectors ──────────────────────────────────────────────────────

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
  chrome.runtime.sendMessage({ action: 'updateCategoryModes', categoryModes: modes }).catch(() => {});
}

document.querySelectorAll('.mode-select').forEach(select => {
  select.addEventListener('change', saveModes);
});

// ── Load stats ───────────────────────────────────────────────────────────────

function loadStats() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const tabId = tab ? tab.id : null;

    chrome.runtime.sendMessage({ action: 'getStats', tabId }, (data) => {
      if (chrome.runtime.lastError || !data) return;

      animateTo(elToday, data.sponsorsSkippedToday || 0);
      animateTo(elTotal, data.sponsorsSkippedTotal || 0);
      elTime.textContent = formatTimeSaved(data.timeSavedTotalSeconds || 0);

      renderSegments(data.tabSegments || []);
      loadModes(data.categoryModes || {});

      const enabled = data.isEnabled !== false;
      toggle.checked = enabled;
      document.body.classList.toggle('disabled', !enabled);
    });
  });
}

// ── Toggle ───────────────────────────────────────────────────────────────────

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  document.body.classList.toggle('disabled', !enabled);
  chrome.runtime.sendMessage({ action: 'setEnabled', enabled }).catch(() => {});
});

// ── Settings ─────────────────────────────────────────────────────────────────

settingsBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  window.close();
});

// ── Footer message rotation ──────────────────────────────────────────────────

footerMsg.textContent = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

// ── Init ─────────────────────────────────────────────────────────────────────

loadStats();
