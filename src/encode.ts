import { spawn } from 'node:child_process';
import { join } from 'node:path';

export async function encode(
  directory: string, count: number, fps: number, output: string,
): Promise<void> {
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
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-8000); });
    child.on('error', reject);
    child.on('close', code => code === 0
      ? resolve()
      : reject(new Error(`FFmpeg exited with ${code}: ${errors}`)));
  });
}
