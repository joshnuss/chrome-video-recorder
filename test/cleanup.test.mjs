import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withCleanup } from '../dist/cleanup.js';

test('nested cleanup preserves the rendering error and reports both cleanup failures', async () => {
  const original = new Error('Navigation failed');
  const warnings = [];
  await assert.rejects(withCleanup(
    () => withCleanup(async () => { throw original; },
      async () => { throw new Error('Browser close failed'); }, message => warnings.push(message)),
    async () => { throw new Error('Frame removal failed'); }, message => warnings.push(message),
  ), error => error === original);
  assert.deepEqual(warnings, ['Cleanup failed: Browser close failed', 'Cleanup failed: Frame removal failed']);
});

test('cleanup failure after successful work is not silently ignored', async () => {
  const failure = new Error('Permission denied');
  await assert.rejects(withCleanup(async () => 'video', async () => { throw failure; }, () => {}),
    error => error === failure);
});

test('cleanup executes once on success and a broken warning sink cannot mask failure', async () => {
  let cleaned = 0;
  assert.equal(await withCleanup(async () => 'video', async () => { cleaned++; }, () => {}), 'video');
  assert.equal(cleaned, 1);
  await assert.rejects(withCleanup(async () => { throw new Error('Original'); },
    async () => { throw new Error('Cleanup'); }, () => { throw new Error('Logger'); }), /Original/);
});
