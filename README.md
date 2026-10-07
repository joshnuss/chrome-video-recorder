# Chrome Video Recorder

Record browser and outputs high-quality video.

## Features

- 4K support.
- 120+ fps framerate.
- Avoids FOCs. Waits for CSS, fonts and images to load.
- Avoids lags. Prevents CPU slowdowns from causing laggy videos.
- Runs headless.

## Playwright Comparison

This CLI produces more predictable frames and timing than Playwright’s real-time video recording.

It seeks animations to exact timestamps and captures every frame, so a 10-second video at 120 FPS contains 1,200 frames—even if rendering takes longer on a slower machine.

## Setup

Requires Node.js 20.19–20.x or 22.12+, Google Chrome, and FFmpeg with `libvpx-vp9`.

```sh
gh clone joshnuss/chrome-video-recorder
cd chrome-video-recorder
pnpm install
pnpm run build
npm link
```

## Usage

Render a video for any URL:

```sh
chrome-video-recorder \
  --url http://localhost:5173/demo.html \
  --width 3840 \
  --height 2160 \
  --duration 10 \
  --fps 120 \
  --output example.webm
```

## Options

| Option           | Default    | Description                                                        |
| ---              | ---        | ---                                                                |
| `-u, --url`      | Required*  | Page to render                                                     |
| `--width`        | `1280`     | Viewport and video width in pixels                                 |
| `--height`       | `720`      | Viewport and video height in pixels                                |
| `-d, --duration` | `10`       | Video duration in seconds                                          |
| `--fps`          | `120`      | Frames per second                                                  |
| `-o, --output`   | `./videos` | Output directory or path; For directories, filenames are generated |
| `--headed`       | Off        | Show Chrome                                                        |
| `--keep-frames`  | Off        | Retain PNG frames                                                  |
| `--json-progress` | Off | Write JSON events to stderr |
| `--dry-run`      | Off        | Print settings without rendering                                   |
| `-h, --help`     |            | Show usage                                                         |
| `-v, --version`  |            | Show version                                                       |

*Omit `--url` when using a positional source. For 4K, use `--width 3840 --height 2160`.

## How it works

- Animations are paused and sampled at exact timestamps. Ten seconds at 120 FPS
  produces 1,200 frames, even when rendering takes longer than ten seconds.
- Fractional durations round to a whole frame, with a minimum of one frame.
- PNG frames require temporary disk space and are removed unless `--keep-frames`
  is set. Encoding uses VP9, CRF 18, and 4:4:4 color; output is not lossless.
- Only CSS/WAAPI animations found in the main document at capture setup are
  controlled. JavaScript timers, canvas/WebGL, video, animated images, iframes,
  scroll-driven animations, and animations created later are not synchronized.
- No audio is recorded.

## License

MIT
