import * as vscode from 'vscode';
import { sanitizeEvent } from '../core/telemetryEvents';

/**
 * Usage telemetry, anonymous and opt-in through VS Code's own setting.
 *
 * - `createTelemetryLogger` honors `telemetry.telemetryLevel`: with telemetry off, `logUsage`
 *   does nothing and the sender is never called.
 * - Built-in common properties (machine and session identifiers) are dropped.
 * - Only whitelisted events and properties reach the sender (see `core/telemetryEvents.ts`).
 * - Every event is written to the "Commit Wizard Telemetry" output channel, so the user can see
 *   exactly what is reported. It is sent to a collector only when the
 *   `gitmojiCommit.telemetry.endpoint` setting holds an https URL; with the default (empty) no
 *   data leaves the machine.
 */
export class Telemetry implements vscode.Disposable {
  private readonly output: vscode.LogOutputChannel;
  private readonly logger: vscode.TelemetryLogger;

  constructor(private readonly extensionVersion: string) {
    this.output = vscode.window.createOutputChannel('Commit Wizard Telemetry', { log: true });
    this.logger = vscode.env.createTelemetryLogger(
      {
        sendEventData: (eventName, data) => this.send(eventName, data),
        sendErrorData: () => {
          // Errors are never reported.
        },
      },
      { ignoreBuiltInCommonProperties: true, ignoreUnhandledErrors: true },
    );
  }

  /** Records a usage event if it is whitelisted and the user allows telemetry. */
  public track(name: string, properties: Record<string, unknown> = {}): void {
    const event = sanitizeEvent(name, properties);
    if (event) {
      this.logger.logUsage(event.name, event.properties);
    }
  }

  private send(eventName: string, data?: Record<string, unknown>): void {
    // VS Code prefixes the event with the extension id; keep the short name.
    const name = eventName.split('/').pop() ?? eventName;
    const event = sanitizeEvent(name, data ?? {});
    if (!event) {
      return;
    }
    const payload = {
      event: event.name,
      properties: event.properties,
      version: this.extensionVersion,
    };
    this.output.info(JSON.stringify(payload));

    const endpoint = vscode.workspace
      .getConfiguration('gitmojiCommit')
      .get<string>('telemetry.endpoint', '')
      .trim();
    if (/^https:\/\//i.test(endpoint)) {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Telemetry must never disturb the user: failures are silent.
      });
    }
  }

  public dispose(): void {
    this.logger.dispose();
    this.output.dispose();
  }
}
