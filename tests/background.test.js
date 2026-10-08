'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../core.js');

const root = path.resolve(__dirname, '..');
const backgroundSource = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const ALL_OFF = Object.fromEntries(Core.CATEGORIES.map(category => [category, 'off']));

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function settleUntil(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('background initialization did not settle');
}

async function loadBackground({ initial = {}, fetchImpl, failGet, failSet, withAction = true, setTimer = setTimeout } = {}) {
  const state = structuredClone(initial);
  let messageListener = null;
  const storage = {
    async get(keys) {
      if (failGet?.(keys)) throw new Error('fixture storage read failure');
      if (keys === null) return structuredClone(state);
      const selected = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (Object.hasOwn(state, key)) selected[key] = structuredClone(state[key]);
      }
      return selected;
    },
    async set(values) {
      if (failSet?.(values)) throw new Error('fixture storage write failure');
      Object.assign(state, structuredClone(values));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key];
    }
  };
  const event = () => ({ addListener() {} });
  const browser = {
    storage: { local: storage },
    runtime: {
      id: 'fixture-extension',
      getManifest: () => ({ version: '2.0.36' }),
      onMessage: { addListener(listener) { messageListener = listener; } },
      onInstalled: event(),
      onStartup: event()
    },
    commands: { onCommand: event() },
    tabs: {
      onRemoved: event(),
      query: async () => [],
      sendMessage: async () => ({ ok: true })
    }
  };
  if (withAction) {
    browser.action = {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {},
      setBadgeTextColor: async () => {}
    };
  }

  const context = {
    LoveSparkCore: Core,
    browser,
    crypto: crypto.webcrypto,
    TextEncoder,
    AbortController,
    fetch: fetchImpl || (async () => { throw new Error('network unavailable'); }),
    setTimeout: setTimer,
    clearTimeout,
    console: { warn() {}, error() {}, log() {} }
  };
  context.globalThis = context;
  vm.runInNewContext(backgroundSource, context, { filename: 'background.js' });
  await settleUntil(() => state.schemaVersion === 3);
  assert.equal(typeof messageListener, 'function');

  return {
    state,
    send: (message, sender = { id: 'fixture-extension', tab: { id: 7 } }) => messageListener(message, sender)
  };
}

test('category-aware cache records contain neither raw video IDs nor category names', async () => {
  const videoID = 'abcdefghijk';
  const urls = [];
  const runtime = await loadBackground({
    initial: { categoryModes: { ...ALL_OFF, sponsor: 'auto' } },
    fetchImpl: async url => {
      urls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => [{ videoID, segments: [{ category: urls.length === 1 ? 'sponsor' : 'intro', segment: [1, 3] }] }]
      };
    }
  });

  const first = await runtime.send({ action: 'fetchSegments', videoID, requestId: 'one' });
  assert.equal(first.status, 'ready');
  await runtime.send({ action: 'updateCategoryModes', categoryModes: { ...ALL_OFF, intro: 'auto' } });
  const second = await runtime.send({ action: 'fetchSegments', videoID, requestId: 'two' });
  assert.equal(second.status, 'ready');
  assert.equal(urls.length, 2, 'category change must not reuse an incomplete cache entry');

  const cacheEntries = Object.entries(runtime.state).filter(([key]) => key.startsWith('segment_cache_v3_'));
  assert.equal(cacheEntries.length, 2);
  for (const [key, record] of cacheEntries) {
    assert.equal(key.includes(videoID), false);
    assert.equal(key.includes('sponsor'), false);
    assert.equal(key.includes('intro'), false);
    assert.deepEqual(Object.keys(record).sort(), ['fetchedAt', 'segments']);
    assert.equal(JSON.stringify(record).includes(videoID), false);
  }
});

test('fresh cache precedes network and bounded stale cache is labeled offline after failure', async () => {
  const videoID = 'stalevid001';
  const modes = { ...ALL_OFF, sponsor: 'auto' };
  const signature = Core.activeCategorySignature(modes);
  const cacheKey = Core.cacheKeyFromDigest(digest(`${videoID}\u0000${signature}`));
  const segment = { category: 'sponsor', segment: [4, 8] };
  let calls = 0;

  const fresh = await loadBackground({
    initial: { categoryModes: modes, [cacheKey]: { segments: [segment], fetchedAt: Date.now() - 1000 } },
    fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); }
  });
  const freshResult = await fresh.send({ action: 'fetchSegments', videoID, requestId: 'fresh' });
  assert.equal(freshResult.source, 'cache');
  assert.equal(calls, 0);

  const stale = await loadBackground({
    initial: { categoryModes: modes, [cacheKey]: { segments: [segment], fetchedAt: Date.now() - 2 * 86400000 } },
    fetchImpl: async () => { calls += 1; throw new Error('offline'); }
  });
  const staleResult = await stale.send({ action: 'fetchSegments', videoID, requestId: 'stale' });
  assert.equal(staleResult.status, 'cached-offline');
  assert.equal(staleResult.source, 'stale-cache');
  const memoryResult = await stale.send({ action: 'fetchSegments', videoID, requestId: 'memory' });
  assert.equal(memoryResult.status, 'cached-offline');
  assert.equal(memoryResult.source, 'stale-cache');
  assert.equal(calls, 1, 'offline result should be held in memory without hiding its status');

  const expired = await loadBackground({
    initial: { categoryModes: modes, [cacheKey]: { segments: [segment], fetchedAt: Date.now() - 8 * 86400000 } },
    fetchImpl: async () => { throw new Error('offline'); }
  });
  const expiredResult = await expired.send({ action: 'fetchSegments', videoID, requestId: 'expired' });
  assert.equal(expiredResult.status, 'unavailable');
  assert.equal(expiredResult.segments.length, 0);
});

test('404 is clean while malformed and failed lookups are unavailable and retryable', async () => {
  const videoID = 'abcdefghijk';
  const modes = { ...ALL_OFF, sponsor: 'auto' };
  const notFound = await loadBackground({
    initial: { categoryModes: modes },
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => [] })
  });
  const clean = await notFound.send({ action: 'fetchSegments', videoID, requestId: '404' });
  assert.equal(clean.status, 'clean');
  assert.equal(clean.retryable, false);

  const malformed = await loadBackground({
    initial: { categoryModes: modes },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => [{ videoID, segments: [{ category: 'bad', segment: [2, 1] }] }] })
  });
  const unavailable = await malformed.send({ action: 'fetchSegments', videoID, requestId: 'bad' });
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.retryable, true);

  const before = structuredClone(malformed.state);
  const invalid = await malformed.send({ action: 'fetchSegments', videoID: '../not-valid', requestId: 'invalid' });
  assert.equal(invalid.ok, false);
  assert.deepEqual(malformed.state, before, 'invalid input must not mutate storage');
});

test('request deadline aborts and storage cache failures remain fail-soft', async () => {
  const videoID = 'abcdefghijk';
  const modes = { ...ALL_OFF, sponsor: 'auto' };
  let aborted = false;
  const timedOut = await loadBackground({
    initial: { categoryModes: modes },
    setTimer: (callback, delay) => setTimeout(callback, delay === 4000 ? 5 : delay),
    fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('aborted'));
      }, { once: true });
    })
  });
  const timeoutResult = await timedOut.send({ action: 'fetchSegments', videoID, requestId: 'timeout' });
  assert.equal(aborted, true);
  assert.equal(timeoutResult.status, 'unavailable');

  let networkCalls = 0;
  const readFailure = await loadBackground({
    initial: { categoryModes: modes },
    failGet: keys => typeof keys === 'string' && keys.startsWith('segment_cache_v3_'),
    fetchImpl: async () => {
      networkCalls += 1;
      return { ok: false, status: 404, json: async () => [] };
    }
  });
  const readResult = await readFailure.send({ action: 'fetchSegments', videoID, requestId: 'read-fail' });
  assert.equal(readResult.status, 'clean');
  assert.equal(networkCalls, 1);

  const writeFailure = await loadBackground({
    initial: { categoryModes: modes },
    failSet: values => Object.keys(values).some(key => key.startsWith('segment_cache_v3_')),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => [{ videoID, segments: [{ category: 'sponsor', segment: [2, 5] }] }]
    })
  });
  const writeResult = await writeFailure.send({ action: 'fetchSegments', videoID, requestId: 'write-fail' });
  assert.equal(writeResult.status, 'ready');
  assert.equal(writeResult.segments.length, 1);
});

test('legacy migration removes only validated raw-ID cache records', async () => {
  const legacy = { segments: [{ category: 'sponsor', segment: [1, 2] }], fetchedAt: Date.now() };
  const runtime = await loadBackground({
    initial: {
      cache_abcdefghijk: legacy,
      cache_preferences: { theme: 'dark' },
      unrelated: { keep: true }
    },
    withAction: false
  });
  await settleUntil(() => !Object.hasOwn(runtime.state, 'cache_abcdefghijk'));
  assert.deepEqual(runtime.state.cache_preferences, { theme: 'dark' });
  assert.deepEqual(runtime.state.unrelated, { keep: true });
});

test('skip receipts make record and undo idempotent across delivery order', async () => {
  const runtime = await loadBackground();
  const first = 'skip_1234567890abcdef';
  await runtime.send({ action: 'undoSkip', receiptId: first });
  await runtime.send({ action: 'skipOccurred', receiptId: first, category: 'sponsor', duration: 12 });
  assert.equal(runtime.state.sponsorsSkippedTotal, 0);
  assert.equal(runtime.state.timeSavedTotalSeconds, 0);
  assert.equal(runtime.state.skipReceipts[first].state, 'undone');

  const second = 'skip_fedcba0987654321';
  await Promise.all([
    runtime.send({ action: 'skipOccurred', receiptId: second, category: 'sponsor', duration: 9 }),
    runtime.send({ action: 'skipOccurred', receiptId: second, category: 'sponsor', duration: 9 })
  ]);
  assert.equal(runtime.state.sponsorsSkippedTotal, 1);
  assert.equal(runtime.state.timeSavedTotalSeconds, 9);
  await Promise.all([
    runtime.send({ action: 'undoSkip', receiptId: second }),
    runtime.send({ action: 'undoSkip', receiptId: second })
  ]);
  assert.equal(runtime.state.sponsorsSkippedTotal, 0);
  assert.equal(runtime.state.timeSavedTotalSeconds, 0);
  assert.equal(runtime.state.categoryStats.sponsor, 0);
});
