import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, openSync, closeSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const run = (args, cwd) => {
  const temp = mkdtempSync(join(tmpdir(), 'animation-cli-output-'));
  const out = openSync(join(temp, 'stdout'), 'w');
  const err = openSync(join(temp, 'stderr'), 'w');
  try {
    const child = spawnSync(process.execPath, [cli, ...args], { cwd, stdio: ['ignore', out, err] });
    if (child.error) throw child.error;
    return {
      status: child.status,
      stdout: readFileSync(join(temp, 'stdout'), 'utf8'),
      stderr: readFileSync(join(temp, 'stderr'), 'utf8'),
    };
  } finally {
    closeSync(out);
    closeSync(err);
    rmSync(temp, { recursive: true, force: true });
  }
};

test('help and version run without launching the renderer', async () => {
  const help = await run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: chrome-video-recorder/);
  assert.equal(help.stderr, '');
  assert.equal((await run(['--version'])).stdout.trim(), '0.1.0');
});

test('dry-run resolves local source and output against caller cwd, including spaces', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'animation-cli-'));
  try {
    writeFileSync(join(cwd, 'my scene.html'), '<h1>Scene</h1>');
    const result = await run(['my scene.html', '--dry-run', '--width', '1080', '--height', '1920',
      '--fps', '120', '-d', '10', '-o', 'my renders', '--keep-frames'], cwd);
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.frames, 1200);
    assert.equal(plan.actualDuration, 10);
    assert.equal(plan.width, 1080);
    assert.equal(plan.height, 1920);
    assert.equal(plan.source, pathToFileURL(join(cwd, 'my scene.html')).href);
    assert.equal(plan.output, join(cwd, 'my renders'));
    assert.equal(plan.keepFrames, true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('invalid flags and values fail before browser launch, with no stack trace', async () => {
  for (const args of [['--fps', '0'], ['--width', '1.5'], ['--duration', 'NaN'],
    ['--output', ''], ['--unknown'], ['one', 'two']]) {
    const result = await run(args);
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, /^chrome-video-recorder:/);
    assert.doesNotMatch(result.stderr, /at .*\.js:\d+/);
    assert.equal(result.stdout, '');
  }
});

test('URL input and fractional duration produce a whole-frame plan', async () => {
  const result = await run(['--url', 'https://example.com/scene', '--duration', '0.012', '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.source, 'https://example.com/scene');
  assert.equal(plan.frames, 1);
  assert.equal(plan.actualDuration, 1 / 120);
});

test('requires an explicit source and rejects ambiguous URL arguments', async () => {
  for (const args of [[], ['--dry-run'], ['--url', ''], ['--url', 'not-a-url'],
    ['--url', 'https://example.com', 'https://example.org']]) {
    const result = await run(args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^chrome-video-recorder:/);
  }
  const result = await run(['https://example.com', '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).source, 'https://example.com/');
});

test('JSON progress formats validation failures and leaves dry-run stdout as JSON', () => {
  const invalid = run(['--json-progress', '--fps', '0']);
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  const error = JSON.parse(invalid.stderr);
  assert.equal(error.type, 'error');
  assert.match(error.message, /--fps/);
  const plan = run(['--url', 'http://localhost:5173', '--json-progress', '--dry-run']);
  assert.equal(plan.status, 0);
  assert.equal(plan.stderr, '');
  assert.equal(JSON.parse(plan.stdout).frames, 1200);
});
