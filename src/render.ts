import { chromium, type JSHandle, type Page } from 'playwright';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { encode } from './encode.js';
import type { RenderOptions } from './options.js';

import { createLogger, type Logger } from './progress.js';
import { withCleanup } from './cleanup.js';
import { navigate } from './navigation.js';

interface OutputPaths {
  video: string;
  report: string;
  framesDirectory: string;
}

interface CaptureResult {
  animationCount: number;
  renderSeconds: number;
}

export async function render(options: RenderOptions, log: Logger = createLogger(false), signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  checkDependencies();
  const files = await createOutputPaths(options.output);

  const output = await withCleanup(async () => {
    const capture = await captureWithChrome(options, files.framesDirectory, log, signal);
    log(`Captured all ${options.frames} frames in ${capture.renderSeconds.toFixed(1)}s. Encoding...`, {
      type: 'progress', phase: 'encoding', framesRendered: options.frames, totalFrames: options.frames,
    });
    signal?.throwIfAborted();
    const encodingStarted = performance.now();
    await encode(files.framesDirectory, options.frames, options.fps, files.video, signal);
    const encodingSeconds = (performance.now() - encodingStarted) / 1000;
    await writeReport(options, files.report, capture, encodingSeconds);
    signal?.throwIfAborted();
    return files.video;
  }, async () => {
    await withCleanup(
      () => cleanupFrames(files.framesDirectory, options.keepFrames, log),
      async () => {
        if (signal?.aborted) {
          await Promise.all([files.video, files.report].map(path => rm(path, { force: true })));
        }
      }, message => log(message, { type: 'warning' }),
    );
  },
  message => log(message, { type: 'warning' }));
  signal?.throwIfAborted();
  log(`Saved video: ${output}`, { type: 'completed', output });
  return output;
}

function checkDependencies(): void {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    throw new Error('Install system FFmpeg with libvpx-vp9 and make sure ffmpeg is on PATH.');
  }
}

async function createOutputPaths(outputDirectory: string): Promise<OutputPaths> {
  await mkdir(outputDirectory, { recursive: true });
  const name = randomUUID();
  return {
    video: join(outputDirectory, `${name}.webm`),
    report: join(outputDirectory, `${name}.json`),
    framesDirectory: await mkdtemp(join(outputDirectory, '.frames-')),
  };
}

async function captureWithChrome(
  options: RenderOptions, framesDirectory: string, log: Logger, signal?: AbortSignal,
): Promise<CaptureResult> {
  signal?.throwIfAborted();
  const browser = await chromium.launch({
    channel: 'chrome', headless: !options.headed,
    handleSIGINT: false, handleSIGTERM: false,
  });
  let closing: Promise<void> | undefined;
  const closeBrowser = () => closing ??= browser.close();
  const abort = () => { void closeBrowser().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  return withCleanup(async () => {
    try {
      signal?.throwIfAborted();
      const context = await browser.newContext({
        viewport: { width: options.width, height: options.height }, deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const animations = await preparePage(page, options.source);
      const animationCount = await animations.evaluate(animations => animations.length);
      if (!animationCount) log('No animations found in the main document; the output may be static.', { type: 'warning' });
      log(`Rendering ${options.frames} frames: ${options.width} × ${options.height}, ${options.fps} FPS, ${(options.frames / options.fps).toFixed(3)}s video.`, {
        type: 'progress', phase: 'starting', framesRendered: 0, totalFrames: options.frames,
      });
      log(`Seeking ${animationCount} animations. Rendering may take longer than the video duration.`);
      const renderSeconds = await captureFrames(page, animations, options, framesDirectory, log, signal);
      return { animationCount, renderSeconds };
    } catch (error) {
      // Closing Chrome interrupts pending navigation/evaluation/screenshot calls.
      signal?.throwIfAborted();
      throw error;
    }
  }, async () => {
    try { await closeBrowser(); }
    finally { signal?.removeEventListener('abort', abort); }
  }, message => log(message, { type: 'warning' }));
}

async function preparePage(page: Page, source: string): Promise<JSHandle<Animation[]>> {
  await navigate(page, source);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, image => image.decode().catch(() => {})));
  });

  // Retain references: finished animations can disappear from getAnimations().
  return page.evaluateHandle(async () => {
    const animations = document.getAnimations();
    for (const animation of animations) animation.pause();
    await Promise.all(animations.map(animation => animation.ready));
    for (const animation of animations) animation.currentTime = 0;
    return animations;
  });
}

async function captureFrames(
  page: Page, animations: JSHandle<Animation[]>, options: RenderOptions,
  framesDirectory: string, log: Logger, signal?: AbortSignal,
): Promise<number> {
  const { frames: frameCount, fps } = options;
  const started = performance.now();
  for (let frame = 0; frame < frameCount; frame++) {
    signal?.throwIfAborted();
    await animations.evaluate((animations, timeMs) => {
      for (const animation of animations) animation.currentTime = timeMs;
      // Flush styles/layout before capturing the paused timeline state.
      document.documentElement.getBoundingClientRect();
    }, frame * 1000 / fps);
    await page.screenshot({
      path: join(framesDirectory, `frame-${String(frame).padStart(8, '0')}.png`),
      type: 'png', animations: 'allow', caret: 'hide',
    });
    if ((frame + 1) % fps === 0 || frame + 1 === frameCount) {
      // The queue worker parses this message to report progress.
      log(`Rendered ${frame + 1}/${frameCount} frames`, {
        type: 'progress', phase: 'rendering', framesRendered: frame + 1, totalFrames: frameCount,
      });
    }
  }
  return (performance.now() - started) / 1000;
}

async function writeReport(
  options: RenderOptions, reportPath: string, capture: CaptureResult, encodingSeconds: number,
): Promise<void> {
  const { width, height, fps, duration, frames: frameCount } = options;
  await writeFile(reportPath, JSON.stringify({
    width, height, fps, requestedDuration: duration, duration: frameCount / fps,
    frames: frameCount, animations: capture.animationCount, renderSeconds: capture.renderSeconds,
    encodingSeconds, firstSampleMs: 0, lastSampleMs: (frameCount - 1) * 1000 / fps,
  }, null, 2) + '\n');
}

async function cleanupFrames(framesDirectory: string, keepFrames: boolean, log: Logger): Promise<void> {
  if (keepFrames) log(`PNG frames: ${framesDirectory}`);
  else await rm(framesDirectory, { recursive: true, force: true });
}
