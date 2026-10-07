import { spawn } from 'node:child_process';
import { join } from 'node:path';

export async function encode(
  directory: string, count: number, fps: number, output: string, signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    // One input image per output frame. No fps filter or real-time resampling.
    const child = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
      '-framerate', String(fps), '-start_number', '0',
      '-i', join(directory, 'frame-%08d.png'), '-frames:v', String(count),
      '-c:v', 'libvpx-vp9', '-crf', '18', '-b:v', '0',
      '-pix_fmt', 'yuv444p', '-deadline', 'good', '-cpu-used', '4', output,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = '';
    let killTimer: NodeJS.Timeout | undefined;
    let spawnError: Error | undefined;
    const abort = () => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
      killTimer.unref();
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-8000); });
    child.on('error', error => { spawnError = error; });
    // Wait for FFmpeg to stop using the frames before allowing filesystem cleanup.
    child.on('close', (code, exitSignal) => {
      signal?.removeEventListener('abort', abort);
      clearTimeout(killTimer);
      if (signal?.aborted) reject(signal.reason);
      else if (spawnError) reject(spawnError);
      else if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with ${exitSignal ?? code}: ${errors}`));
    });
  });
}
