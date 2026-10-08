// YouTube Sponsor Skip v2 — popup.js
'use strict';

// Theme dropdown
const THEMES = ['retro', 'dark', 'beige', 'slate'];
const THEME_NAMES = { retro: 'Retro Pink', dark: 'Dark', beige: 'Beige', slate: 'Slate' };
function applyTheme(t) {
  THEMES.forEach(n => document.body.classList.remove('theme-' + n));
  document.body.classList.add('theme-' + t);
  const label = document.getElementById('themeLabel');
  if (label) label.textContent = THEME_NAMES[t] || t;
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.theme === t);
  });
}
(function initThemeDropdown() {
  const toggle = document.getElementById('themeToggle');
  const menu = document.getElementById('themeMenu');
  if (toggle && menu) {
    toggle.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); });
    menu.addEventListener('click', (e) => {
      const opt = e.target.closest('.theme-option');
      if (!opt) return;
      const theme = opt.dataset.theme;
      applyTheme(theme);
      browser.storage.local.set({ theme });
      menu.classList.remove('open');
    });
    document.addEventListener('click', () => menu.classList.remove('open'));
  }
  browser.storage.local.get(['theme', 'darkMode']).then(({ theme, darkMode }) => {
    if (!theme && darkMode) theme = 'dark';
    applyTheme(theme || 'retro');
  });
})();

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
const lookupStatus = document.getElementById('lookup-status');

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
    // lookup-status owns all empty/error copy so the popup never shows a
    // contradictory generic "open a video" message beneath a real status.
    emptyState.style.display = 'none';
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

function renderLookupStatus(data) {
  if (!lookupStatus) return;
  const presentation = data.statusPresentation || { state: data.status || 'non-video', message: 'Open a YouTube video to scan segments' };
  lookupStatus.dataset.state = presentation.state;
  lookupStatus.textContent = presentation.message;
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
  browser.runtime.sendMessage({ action: 'updateCategoryModes', categoryModes: modes }).catch(() => {});
}

document.querySelectorAll('.mode-select').forEach(select => {
  select.addEventListener('change', saveModes);
});

// ── Load stats ───────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = Number.isInteger(tab?.id) ? tab.id : null;
    let pageState = null;
    if (tabId !== null) {
      try { pageState = await browser.tabs.sendMessage(tabId, { action: 'getPageState' }); } catch (_) {}
    }
    const data = await browser.runtime.sendMessage({ action: 'getStats', tabId });
    if (!data) return;
    const urlMatch = (tab?.url || '').match(/[?&]v=([A-Za-z0-9_-]{11})|\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})/);
    const urlVideoID = urlMatch ? (urlMatch[1] || urlMatch[2]) : null;
    if (data.isEnabled !== false && pageState?.ok && pageState.videoID === urlVideoID) {
      data.tabSegments = pageState.segments || [];
      data.status = pageState.status || 'unknown';
      data.source = pageState.source || null;
      data.statusPresentation = LoveSparkCore.presentStatus(data.status, data.source, data.tabSegments.length);
    } else if (data.isEnabled !== false && !urlVideoID) {
      data.status = 'non-video';
      data.statusPresentation = LoveSparkCore.presentStatus('non-video', null, 0);
    }

      animateTo(elToday, data.sponsorsSkippedToday || 0);
      animateTo(elTotal, data.sponsorsSkippedTotal || 0);
      elTime.textContent = formatTimeSaved(data.timeSavedTotalSeconds || 0);

      renderSegments(data.tabSegments || []);
      renderLookupStatus(data);
      loadModes(data.categoryModes || {});

      const enabled = data.isEnabled !== false;
      toggle.checked = enabled;
      document.body.classList.toggle('disabled', !enabled);
  } catch (error) {
    renderLookupStatus({ status: 'unknown', statusPresentation: LoveSparkCore.presentStatus('unknown', null, 0) });
  }
}

// ── Toggle ───────────────────────────────────────────────────────────────────

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  document.body.classList.toggle('disabled', !enabled);
  browser.runtime.sendMessage({ action: 'setEnabled', enabled }).catch(() => {});
});

// ── Settings ─────────────────────────────────────────────────────────────────

settingsBtn.addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL('settings.html') });
  window.close();
});

// ── Footer message rotation ──────────────────────────────────────────────────

footerMsg.textContent = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

// ── Init ─────────────────────────────────────────────────────────────────────

loadStats();

/* ── Author / Ko-fi Footer ── */
document.body.insertAdjacentHTML('beforeend', LoveSparkFooter.render());
