import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navigate } from '../dist/navigation.js';

test('HTTP navigation failures retain original cause and explain fresh sessions', async () => {
  const original = new Error('page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE');
  await assert.rejects(navigate({ goto: async () => { throw original; } }, 'https://example.com'), error => {
    assert.equal(error.cause, original);
    assert.match(error.message, /fresh Chrome session/);
    return true;
  });
});

test('HTTP error pages fail instead of being rendered as successful output', async () => {
  await assert.rejects(navigate({ goto: async () => ({ status: () => 403, statusText: () => 'Forbidden' }) }, 'https://example.com'), /HTTP 403 Forbidden/);
  await navigate({ goto: async () => ({ status: () => 200 }) }, 'https://example.com');
  await navigate({ goto: async () => null }, 'file:///demo.html');
});

test('unrelated failures retain their original diagnostic', async () => {
  const timeout = new Error('Timeout 30000ms exceeded');
  await assert.rejects(navigate({ goto: async () => { throw timeout; } }, 'https://example.com'), error => error === timeout);
});
