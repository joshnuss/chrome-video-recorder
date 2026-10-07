import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { resolveSource } from './source.js';

export interface RenderOptions {
  width: number;
  height: number;
  fps: number;
  duration: number;
  frames: number;
  output: string;
  headed: boolean;
  keepFrames: boolean;
  source: string;
}

function positive(name: string, value: string, integer = false): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || (integer && !Number.isSafeInteger(number))) {
    throw new Error(`--${name} must be a positive ${integer ? 'integer' : 'number'}.`);
  }
  return number;
}

export type Command =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'render'; options: RenderOptions; dryRun: boolean; jsonProgress: boolean };

export function parseOptions(args: string[]): Command {
  const { values, positionals } = parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      url: { type: 'string', short: 'u' },
      width: { type: 'string', default: '1280' },
      height: { type: 'string', default: '720' },
      duration: { type: 'string', short: 'd', default: '10' },
      fps: { type: 'string', default: '120' },
      output: { type: 'string', short: 'o', default: 'videos' },
      headed: { type: 'boolean', default: false },
      'keep-frames': { type: 'boolean', default: false },
      'json-progress': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });
  if (values.help) return { kind: 'help' };
  if (values.version) return { kind: 'version' };
  if (positionals.length > 1) throw new Error('Expected at most one source URL or HTML file.');
  if (values.url !== undefined && positionals.length) throw new Error('Use --url or a positional source, not both.');
  const width = positive('width', values.width, true);
  const height = positive('height', values.height, true);
  const fps = positive('fps', values.fps, true);
  const duration = positive('duration', values.duration);
  const frames = Math.max(1, Math.round(duration * fps));
  if (!Number.isSafeInteger(frames)) throw new Error('Duration × FPS exceeds the supported frame count.');
  if (!values.output.trim()) throw new Error('--output must be a non-empty directory path.');

  const source = resolveSource(values.url ?? positionals[0], values.url !== undefined);

  const options: RenderOptions = {
    width, height, fps, duration, frames, source,
    output: resolve(values.output), headed: values.headed, keepFrames: values['keep-frames'],
  };
  return { kind: 'render', options, dryRun: values['dry-run'], jsonProgress: values['json-progress'] };
}
