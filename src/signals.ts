export class RenderCancelled extends Error {
  constructor(public readonly signalName: 'SIGINT' | 'SIGTERM') {
    super(`Render cancelled by ${signalName}.`);
    this.name = 'RenderCancelled';
  }
  get exitCode(): number { return this.signalName === 'SIGINT' ? 130 : 143; }
}

export function installSignalHandlers() {
  const controller = new AbortController();
  const interrupt = () => controller.abort(new RenderCancelled('SIGINT'));
  const terminate = () => controller.abort(new RenderCancelled('SIGTERM'));
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  return {
    signal: controller.signal,
    dispose() {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', terminate);
    },
  };
}
