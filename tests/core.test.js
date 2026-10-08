'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');

function fakeClock() {
  let time = 0;
  let nextId = 1;
  const jobs = new Map();
  return {
    setTimer(callback, delay) {
      const id = nextId++;
      jobs.set(id, { callback, at: time + delay });
      return id;
    },
    clearTimer(id) { jobs.delete(id); },
    tick(ms) {
      const end = time + ms;
      while (true) {
        const due = [...jobs.entries()]
          .filter(([, job]) => job.at <= end)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        jobs.delete(due[0]);
        time = due[1].at;
        due[1].callback();
      }
      time = end;
    },
    pending: () => jobs.size,
    now: () => time
  };
}

test('segment validation rejects malformed payloads rather than partially accepting them', () => {
  const valid = { category: 'sponsor', segment: [10, 20] };
  assert.deepEqual(Core.validateSegments([valid]), [valid]);
  assert.equal(Core.validateSegments([valid, { ...valid, category: 'unknown' }]), null);
  assert.equal(Core.validateSegments([{ ...valid, segment: [20, 10] }]), null);
  assert.equal(Core.validateSegments([{ ...valid, segment: [0, Number.POSITIVE_INFINITY] }]), null);
  assert.deepEqual(Core.extractSegments([{ videoID: 'abcdefghijk', segments: [valid] }], 'abcdefghijk'), [valid]);
  assert.equal(Core.extractSegments({ bad: true }, 'abcdefghijk'), null);
  assert.equal(Core.isInRange(10, valid), true);
  assert.equal(Core.isInRange(19.8, valid), false);
  assert.equal(Core.isInRange(21, valid), false);
});

test('lifecycle cancellation prevents a stale countdown callback', () => {
  const clock = fakeClock();
  const controller = Core.createLifecycleController({
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    now: clock.now
  });
  let calls = 0;
  const oldToken = controller.begin();
  assert.equal(controller.countdown(oldToken, 3000, () => { calls += 1; }), true);
  const newToken = controller.begin();
  clock.tick(3000);
  assert.equal(calls, 0);
  assert.equal(controller.valid(oldToken), false);
  assert.equal(controller.valid(newToken), true);
  assert.equal(clock.pending(), 0);
});

test('transient retry runs at most once and is cancelled by lifecycle changes', () => {
  const clock = fakeClock();
  const controller = Core.createLifecycleController({
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });
  let calls = 0;
  let token = controller.begin();
  assert.equal(controller.retryOnce(token, 3000, () => { calls += 1; }), true);
  assert.equal(controller.retryOnce(token, 3000, () => { calls += 1; }), false);
  clock.tick(2999);
  assert.equal(calls, 0);
  clock.tick(1);
  assert.equal(calls, 1);

  token = controller.begin();
  assert.equal(controller.retryOnce(token, 3000, () => { calls += 1; }), true);
  controller.cancel();
  clock.tick(3000);
  assert.equal(calls, 1);
});

test('popup status presentation keeps unavailable distinct from clean and cached', () => {
  const unavailable = Core.presentStatus('unavailable', null, 0);
  const clean = Core.presentStatus('clean', 'network', 0);
  const cached = Core.presentStatus('cached-offline', 'stale-cache', 2);
  const nonVideo = Core.presentStatus('non-video', null, 0);

  assert.equal(unavailable.state, 'unavailable');
  assert.notEqual(unavailable.message, clean.message);
  assert.match(cached.message, /cached/i);
  assert.equal(nonVideo.state, 'non-video');
});

test('category-aware cache keys and input validators avoid raw identifiers', () => {
  const modes = Core.normalizeModes({ sponsor: 'auto' });
  assert.equal(Core.activeCategorySignature(modes), 'sponsor');
  assert.equal(Core.cacheKeyFromDigest('abc'), 'segment_cache_v3_abc');
  const legacyRecord = { segments: [], fetchedAt: Date.now() };
  assert.equal(Core.isLegacyRawCacheKey('cache_abcdefghijk', legacyRecord), true);
  assert.equal(Core.isLegacyRawCacheKey('cache_preferences', { theme: 'dark' }), false);
  assert.equal(Core.sanitizeDuration(-1), null);
  assert.equal(Core.isValidReceiptId('skip_1234567890abcdef'), true);
});

test('watch, Shorts, and embed URLs resolve only exact video IDs', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=abcdefghijk&list=one',
    'https://www.youtube.com/shorts/abcdefghijk',
    'https://www.youtube-nocookie.com/embed/abcdefghijk?start=2'
  ]) assert.equal(Core.parseYouTubeVideoId(url), 'abcdefghijk');
  assert.equal(Core.parseYouTubeVideoId('https://www.youtube.com/'), null);
  assert.equal(Core.parseYouTubeVideoId('https://www.youtube.com/watch?v=too-short'), null);
});

test('video binding replaces same-ID elements without duplicate active listeners', () => {
  const fakeVideo = duration => {
    const listeners = new Map();
    return {
      duration,
      addEventListener(type, listener) { listeners.set(type, listener); },
      removeEventListener(type, listener) {
        if (listeners.get(type) === listener) listeners.delete(type);
      },
      listeners
    };
  };
  let metadataCalls = 0;
  const update = () => {};
  const binding = Core.createVideoBinding({ onTimeUpdate: update, onMetadata: () => { metadataCalls += 1; } });
  const first = fakeVideo(Number.NaN);
  const replacement = fakeVideo(120);

  assert.equal(binding.attach(first), true);
  assert.deepEqual([...first.listeners.keys()].sort(), ['loadedmetadata', 'seeking', 'timeupdate']);
  assert.equal(binding.attach(first), false, 'reattaching the same element must not duplicate listeners');
  assert.equal(binding.attach(replacement), true);
  assert.equal(first.listeners.size, 0, 'replacement detaches every listener from the old element');
  assert.deepEqual([...replacement.listeners.keys()].sort(), ['seeking', 'timeupdate']);
  assert.equal(metadataCalls, 1);
  assert.equal(binding.detach(), true);
  assert.equal(replacement.listeners.size, 0);
});

test('every lifecycle cancellation reason invalidates delayed playback work', () => {
  for (const reason of [
    'navigation', 'disable', 'replacement', 'non-video', 'mode-change',
    'whitelist', 'watch-anyway', 'toast-cancel', 'pause-or-scrub', 'detachment'
  ]) {
    const clock = fakeClock();
    const controller = Core.createLifecycleController({ setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    let seeks = 0;
    const token = controller.begin();
    controller.countdown(token, 3000, () => { seeks += 1; });
    controller.cancel(reason);
    clock.tick(3000);
    assert.equal(seeks, 0, `${reason} left delayed work active`);
  }
});
