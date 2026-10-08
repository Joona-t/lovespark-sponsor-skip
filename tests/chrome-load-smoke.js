'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function targets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json`);
  if (!response.ok) throw new Error(`debug target query returned ${response.status}`);
  return response.json();
}

async function browserDebuggerUrl(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!response.ok) throw new Error(`debug version query returned ${response.status}`);
  return (await response.json()).webSocketDebuggerUrl;
}

async function waitForBrowser(port, process) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && process.exitCode === null) {
    try { return await browserDebuggerUrl(port); } catch (err) { console.warn('[tests] waitForBrowser:', err); }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Chrome DevTools endpoint did not start');
}

async function waitForWorker(port, process) {
  const deadline = Date.now() + 15000;
  let lastTargets = [];
  while (Date.now() < deadline && process.exitCode === null) {
    try {
      lastTargets = await targets(port);
      const worker = lastTargets.find(target =>
        target.type === 'service_worker' && target.url.endsWith('/background-worker.js'));
      if (worker) return worker;
    } catch (err) { console.warn('[tests] unknown:', err); }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  const summary = lastTargets.map(target => `${target.type}:${target.url}`).join(', ') || 'none';
  throw new Error(`exact background-worker.js target did not start; targets: ${summary}`);
}

function cdpRequest(webSocketDebuggerUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketDebuggerUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('DevTools evaluation timed out'));
    }, 5000);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: 1,
        method,
        params
      }));
    });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('DevTools websocket failed'));
    });
  });
}

function evaluate(webSocketDebuggerUrl, expression) {
  return cdpRequest(webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
}

async function main() {
  assert.equal(fs.existsSync(chrome), true, `Chrome missing at ${chrome}`);
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sponsor-skip-chrome-'));
  let stderr = '';
  const child = spawn(chrome, [
    '--disable-gpu',
    '--no-first-run',
    '--disable-default-apps',
    '--disable-component-update',
    '--enable-unsafe-extension-debugging',
    '--enable-logging=stderr',
    '--v=1',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    '--window-position=-10000,-10000',
    '--window-size=800,600',
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', chunk => { stderr += chunk; });

  try {
    const browserSocket = await waitForBrowser(port, child);
    const loaded = await cdpRequest(browserSocket, 'Extensions.loadUnpacked', { path: root });
    assert.equal(typeof loaded.id, 'string', `unpacked load failed: ${JSON.stringify(loaded)}`);
    const worker = await waitForWorker(port, child);
    const evaluation = await evaluate(
      worker.webSocketDebuggerUrl,
      "chrome.runtime.sendMessage({action:'ping'}).then(value => JSON.stringify(value))"
    );
    const exception = evaluation.exceptionDetails;
    assert.equal(exception, undefined, exception?.text || 'worker ping evaluation failed');
    const ping = JSON.parse(evaluation.result.value);
    assert.deepEqual(ping, { ok: true, product: 'lovespark-sponsor-skip', version: '2.0.36' });
    const fatal = stderr.split('\n').filter(line =>
      /Failed to load extension|Manifest is not valid|Uncaught (?:SyntaxError|ReferenceError)/.test(line));
    assert.deepEqual(fatal, []);
    console.log(`Chrome extension-load smoke PASS: ${worker.url}; ping ok ${ping.version}`);
  } catch (error) {
    const diagnostic = stderr.trim().split('\n').slice(-20).join('\n');
    if (diagnostic) error.message += `\nChrome stderr tail:\n${diagnostic}`;
    throw error;
  } finally {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`Chrome extension-load smoke FAILED: ${error.stack || error.message}`);
  process.exitCode = 1;
});
