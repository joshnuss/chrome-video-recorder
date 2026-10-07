import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function resolveSource(input: string | undefined, urlOnly = false): string {
  if (!input?.trim()) throw new Error('A source is required. Use --url http://localhost:5173 or pass an HTML file.');
  if (urlOnly && !/^https?:\/\//i.test(input)) throw new Error('--url must be an HTTP(S) URL.');
  if (/^https?:\/\//i.test(input)) {
    try { return new URL(input).href; }
    catch { throw new Error('Source must be a valid HTTP(S) URL.'); }
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^file:/i.test(input) && !/^[a-z]:[\\/]/i.test(input)) {
    throw new Error('Source must be an HTTP(S) URL or local HTML file.');
  }
  const path = /^file:/i.test(input) ? fileURLToPath(input) : resolve(input);
  try {
    if (!statSync(path).isFile()) throw new Error('Not a file');
  } catch {
    throw new Error(`Source file not found or not a regular file: ${path}`);
  }
  return pathToFileURL(path).href;
}
