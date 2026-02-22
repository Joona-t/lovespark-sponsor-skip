// LoveSpark Sponsor Skip — popup.js
'use strict';

const elToday    = document.getElementById('val-today');
const elTotal    = document.getElementById('val-total');
const elTime     = document.getElementById('val-time');
const elSegments = document.getElementById('val-segments');
const toggle     = document.getElementById('toggle-enabled');
const toggleLbl  = document.getElementById('toggle-label');
const settingsBtn = document.getElementById('settings-btn');

// ── Format time saved ───────────────────────────────────────────────────────

function formatTimeSaved(seconds) {
  if (!seconds || seconds < 1) return '< 1 min';
  if (seconds < 3600) {
    const mins = Math.round(seconds / 60);
    return mins < 1 ? '< 1 min' : `${mins} min`;
  }
  const hours = (seconds / 3600).toFixed(1);
  return `${hours}h`;
}

// ── Animate counter to target value ────────────────────────────────────────

function animateTo(el, target) {
  const start = parseInt(el.textContent, 10) || 0;
  if (start === target) return;

  const diff     = target - start;
  const steps    = Math.min(Math.abs(diff), 20);
  const stepSize = diff / steps;
  let   current  = start;
  let   step     = 0;

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

// ── Load and display stats ──────────────────────────────────────────────────

function loadStats() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const tabId = tab ? tab.id : null;

    chrome.runtime.sendMessage({ action: 'getStats', tabId }, (data) => {
      if (chrome.runtime.lastError || !data) return;

      animateTo(elToday, data.sponsorsSkippedToday || 0);
      animateTo(elTotal, data.sponsorsSkippedTotal || 0);

      const timeSaved = formatTimeSaved(data.timeSavedTotalSeconds || 0);
      elTime.textContent = timeSaved;

      // Current video segment info
      if (data.tabSegmentCount !== null && data.tabSegmentCount !== undefined) {
        const count = data.tabSegmentCount;
        elSegments.textContent = count === 0
          ? 'no segments found'
          : `${count} segment${count === 1 ? '' : 's'} found`;
      } else {
        elSegments.textContent = 'not on a video';
      }

      // Toggle state
      const enabled = data.isEnabled !== false;
      toggle.checked = enabled;
      toggleLbl.textContent = enabled ? 'Enabled' : 'Disabled';
      document.body.classList.toggle('disabled', !enabled);
    });
  });
}

// ── Toggle handler ──────────────────────────────────────────────────────────

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  toggleLbl.textContent = enabled ? 'Enabled' : 'Disabled';
  document.body.classList.toggle('disabled', !enabled);

  chrome.runtime.sendMessage({ action: 'setEnabled', enabled }, () => {
    if (chrome.runtime.lastError) {
      // Revert on error
      toggle.checked = !enabled;
      toggleLbl.textContent = !enabled ? 'Enabled' : 'Disabled';
      document.body.classList.toggle('disabled', enabled);
    }
  });
});

// ── Settings button ─────────────────────────────────────────────────────────

settingsBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  window.close();
});

// ── Init ────────────────────────────────────────────────────────────────────

loadStats();
