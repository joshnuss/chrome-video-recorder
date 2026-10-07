#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseOptions } from './options.js';

const help = `Usage: chrome-video-recorder --url <URL> [options]
       chrome-video-recorder <URL | HTML_FILE> [options]

Render CSS animations at exact frame timestamps, then encode a WebM video.
A source is required. To try the development demo, run npm run dev and pass
--url http://127.0.0.1:5173/demo.html.

Options:
  -u, --url <URL>        HTTP(S) page to render
  --width <pixels>       Viewport/video width (default: 1280)
  --height <pixels>      Viewport/video height (default: 720)
  -d, --duration <sec>   Video duration, not render time (default: 10)
  --fps <number>         Samples/output frames per second (default: 120)
  -o, --output <dir>     Output directory (default: ./videos)
  --headed              Show Chrome while rendering
  --keep-frames         Keep the individual PNG screenshots
  --dry-run             Print the render plan as JSON without launching Chrome
  -h, --help            Show this help
  -v, --version         Show version

Examples:
  chrome-video-recorder --url http://localhost:5173 --width 1920 --height 1080 --fps 120 --duration 10
  chrome-video-recorder ./scene.html -o ./renders --keep-frames
  chrome-video-recorder http://localhost:5173 --width 1080 --height 1920

Requires Google Chrome and system FFmpeg with libvpx-vp9.
Output names are generated automatically. Rendering may be slower than real time.
Controls existing main-document CSS/WAAPI animations, not JS timers or video.
`;

try {
  const parsed = parseOptions(process.argv.slice(2));
  if (parsed.help) {
    console.log(help);
  } else if (parsed.version) {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    console.log(pkg.version);
  } else if (parsed.options) {
    if (parsed.dryRun) {
      console.log(JSON.stringify({
        ...parsed.options,
        actualDuration: parsed.options.frames / parsed.options.fps,
      }, null, 2));
    } else {
      // Help, version, validation and dry-run do not load Playwright.
      const { render } = await import('./render.js');
      const output = await render(parsed.options);
      // Progress goes to stderr; stdout contains only the finished video path.
      console.log(output);
    }
  }
} catch (error) {
  console.error(`chrome-video-recorder: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
