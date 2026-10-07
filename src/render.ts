import { chromium } from 'playwright';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { encode } from './encode.js';

import type { RenderOptions } from './options.js';

export async function render(options: RenderOptions, log = console.error): Promise<string> {
  const { width, height, fps, duration, frames: count } = options;
  const size = { width, height };
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    throw new Error('Install system FFmpeg with libvpx-vp9 and make sure ffmpeg is on PATH.');
  }

  const outputDir = options.output;
  await mkdir(outputDir, { recursive: true });
  const output = join(outputDir, `${randomUUID()}.webm`);
  const browser = await chromium.launch({ channel: 'chrome', headless: !options.headed });
  let directory: string | undefined;

  try {
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(options.source, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, image => image.decode().catch(() => {})));
    });

    // Keep references: finished animations may disappear from getAnimations(),
    // but their timelines still need seeking on subsequent frames.
    const animations = await page.evaluateHandle(async () => {
      const animations = document.getAnimations();
      for (const animation of animations) animation.pause();
      await Promise.all(animations.map(animation => animation.ready));
      for (const animation of animations) animation.currentTime = 0;
      return animations;
    });
    const animationCount = await animations.evaluate(animations => animations.length);
    if (!animationCount) log('No animations found in the main document; the output may be static.');

    directory = await mkdtemp(join(outputDir, '.frames-'));
    log(`Rendering ${count} frames: ${size.width} × ${size.height}, ${fps} FPS, ${(count / fps).toFixed(3)}s video.`);
    log(`Seeking ${animationCount} animations. Rendering may take longer than the video duration.`);
    const started = performance.now();
    for (let frame = 0; frame < count; frame++) {
      const timeMs = frame * 1000 / fps;
      await animations.evaluate((animations, time) => {
        for (const animation of animations) animation.currentTime = time;
        // Flush styles/layout; screenshots then capture the paused timeline state.
        document.documentElement.getBoundingClientRect();
      }, timeMs);
      await page.screenshot({
        path: join(directory, `frame-${String(frame).padStart(8, '0')}.png`),
        type: 'png', animations: 'allow', caret: 'hide',
      });
      if ((frame + 1) % fps === 0 || frame + 1 === count) {
        log(`Rendered ${frame + 1}/${count} frames`);
      }
    }
    const renderSeconds = (performance.now() - started) / 1000;
    await context.close();
    await browser.close();
    log(`Captured all ${count} frames in ${renderSeconds.toFixed(1)}s. Encoding...`);
    const encodingStarted = performance.now();
    await encode(directory, count, fps, output);
    await writeFile(output.replace(/\.webm$/, '.json'), JSON.stringify({
      ...size, fps, requestedDuration: duration, duration: count / fps,
      frames: count, animations: animationCount, renderSeconds,
      encodingSeconds: (performance.now() - encodingStarted) / 1000,
      firstSampleMs: 0, lastSampleMs: (count - 1) * 1000 / fps,
    }, null, 2) + '\n');
    log(`Saved video: ${output}`);
    return output;
  } finally {
    await browser.close();
    if (directory) {
      if (options.keepFrames) log(`PNG frames: ${directory}`);
      else await rm(directory, { recursive: true, force: true });
    }
  }
}
