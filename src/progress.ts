export type RenderEvent =
  | { type: 'info' | 'warning' | 'error' }
  | { type: 'progress'; phase: 'starting' | 'rendering' | 'encoding'; framesRendered: number; totalFrames: number }
  | { type: 'completed'; output: string };

export type Logger = (message: string, event?: RenderEvent) => void;

export function createLogger(json: boolean, write: (line: string) => void = console.error): Logger {
  return (message, event = { type: 'info' }) => {
    write(json ? JSON.stringify({ ...event, message }) : message);
  };
}
