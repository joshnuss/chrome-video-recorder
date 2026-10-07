import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { render } from '../dist/render.js';
import { encode } from '../dist/encode.js';
import { parseOptions } from '../dist/options.js';
import { installSignalHandlers, RenderCancelled } from '../dist/signals.js';

test('SIGINT and SIGTERM abort without exiting and unregister their handlers', () => {
  for (const name of ['SIGINT', 'SIGTERM']) {
    const before = process.listenerCount(name);
    const cancellation = installSignalHandlers();
    try {
      process.emit(name);
      assert.equal(cancellation.signal.aborted, true);
      assert.equal(cancellation.signal.reason.exitCode, name === 'SIGINT' ? 130 : 143);
    } finally { cancellation.dispose(); }
    assert.equal(process.listenerCount(name), before);
  }
});

test('capture cancellation closes Chrome once and removes frames unless explicitly kept', async () => {
  const originalLaunch = chromium.launch;
  const root = await mkdtemp(join(tmpdir(), 'cancel-capture-'));
  try {
    for (const keep of [false, true]) {
      const output = join(root, String(keep));
      const controller = new AbortController();
      const reason = new RenderCancelled('SIGINT');
      let closed = 0;
      chromium.launch = async (launchOptions) => {
        assert.equal(launchOptions.handleSIGINT, false);
        return {
          close: async () => { closed++; },
          newContext: async () => ({ newPage: async () => ({
            goto: async () => null,
            evaluate: async () => {},
            evaluateHandle: async () => ({ evaluate: async () => 1 }),
            screenshot: async ({ path }) => {
              await writeFile(path, 'frame');
              controller.abort(reason);
              throw new Error('Target closed');
            },
          }) }),
        };
      };
      const { options } = parseOptions(['--url', 'http://example.com', '--output', output,
        ...(keep ? ['--keep-frames'] : [])]);
      await assert.rejects(render(options, () => {}, controller.signal), error => error === reason);
      assert.equal(closed, 1);
      const files = await readdir(output);
      assert.equal(files.length, keep ? 1 : 0);
      if (keep) assert.deepEqual(await readdir(join(output, files[0])), ['frame-00000000.png']);
    }
  } finally {
    chromium.launch = originalLaunch;
    await rm(root, { recursive: true, force: true });
  }
});

test('encoding cancellation waits for FFmpeg to stop', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cancel-encode-'));
  const oldPath = process.env.PATH;
  const marker = join(root, 'started');
  const stopped = join(root, 'stopped');
  try {
    await writeFile(join(root, 'ffmpeg'), `#!${process.execPath}
const fs = require('node:fs');
process.on('SIGTERM', () => { fs.writeFileSync(${JSON.stringify(stopped)}, 'yes'); process.exit(0); });
fs.writeFileSync(${JSON.stringify(marker)}, 'yes');
setInterval(() => {}, 1000);
`, { mode: 0o755 });
    process.env.PATH = `${root}:${oldPath}`;
    const controller = new AbortController();
    const reason = new RenderCancelled('SIGTERM');
    const encoding = encode(root, 1, 1, join(root, 'video.webm'), controller.signal);
    const assertion = assert.rejects(encoding, error => error === reason);
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        try { await access(marker); ready = true; break; } catch { await delay(20); }
      }
      assert.ok(ready, 'Fake FFmpeg started');
    } finally { controller.abort(reason); }
    await assertion;
    await access(stopped);
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});
