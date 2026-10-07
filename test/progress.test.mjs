import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../dist/progress.js';
import { parseOptions } from '../dist/options.js';
import { resolveSource } from '../dist/source.js';

test('JSON events preserve machine-readable progress and escape multiline errors', () => {
  const lines = [];
  const log = createLogger(true, line => lines.push(line));
  log('Rendered 120/240 frames', { type: 'progress', phase: 'rendering', framesRendered: 120, totalFrames: 240 });
  log('First line\nSecond line', { type: 'error' });
  log('Saved video: /tmp/video.webm', { type: 'completed', output: '/tmp/video.webm' });
  assert.ok(lines.every(line => !line.includes('\n')));
  assert.deepEqual(JSON.parse(lines[0]), { type: 'progress', phase: 'rendering', framesRendered: 120, totalFrames: 240, message: 'Rendered 120/240 frames' });
  assert.equal(JSON.parse(lines[1]).message, 'First line\nSecond line');
  assert.equal(JSON.parse(lines[2]).output, '/tmp/video.webm');
});

test('default logger retains the worker text protocol', () => {
  const lines = [];
  createLogger(false, line => lines.push(line))('Rendered 120/240 frames', {
    type: 'progress', phase: 'rendering', framesRendered: 120, totalFrames: 240,
  });
  assert.deepEqual(lines, ['Rendered 120/240 frames']);
});

test('command variants and source validation are explicit', () => {
  assert.deepEqual(parseOptions(['--help']), { kind: 'help' });
  assert.deepEqual(parseOptions(['--version']), { kind: 'version' });
  const command = parseOptions(['--url', 'https://example.com', '--json-progress']);
  assert.equal(command.kind, 'render');
  assert.equal(command.jsonProgress, true);
  assert.equal(command.options.source, 'https://example.com/');
  assert.equal(resolveSource('https://example.com?a=1&b=2'), 'https://example.com/?a=1&b=2');
  assert.throws(() => resolveSource('http://['), /valid HTTP/);
  assert.throws(() => resolveSource('ftp://example.com'), /HTTP/);
  assert.throws(() => resolveSource('./demo.html', true), /HTTP/);
});
