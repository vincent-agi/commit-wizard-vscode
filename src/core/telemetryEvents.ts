/**
 * The only telemetry this extension can emit. Events and properties are whitelisted here so that
 * a free-text value (commit message, path, repository name, user name) can never be attached by
 * mistake: every property is a boolean, a small number, or a short lowercase token.
 */
export const TELEMETRY_EVENTS = {
  /** A commit made from the panel. */
  commit: ['typeKind', 'amend', 'push', 'aiDraft'],
  /** Hooks installed through the installer. */
  hooksInstalled: ['manager', 'presets'],
  /** A command run from the palette or a view. */
  command: ['name'],
} as const;

export type TelemetryEventName = keyof typeof TELEMETRY_EVENTS;

export type TelemetryValue = boolean | number | string;

export interface TelemetryEvent {
  name: TelemetryEventName;
  properties: Record<string, TelemetryValue>;
}

/** Lowercase letters, digits and hyphens, comma-separated lists allowed; 40 characters max. */
const TOKEN = /^[a-z0-9-]+(,[a-z0-9-]+)*$/;
const MAX_TOKEN_LENGTH = 40;
const MAX_NUMBER = 1_000_000;

function isSafeValue(value: unknown): value is TelemetryValue {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') {
    return Number.isFinite(value) && Math.abs(value) <= MAX_NUMBER;
  }
  return typeof value === 'string' && value.length <= MAX_TOKEN_LENGTH && TOKEN.test(value);
}

/**
 * Validates an event against the whitelist. Unknown events yield `undefined`; unknown property
 * names and values that are not safe tokens are dropped.
 */
export function sanitizeEvent(
  name: string,
  properties: Record<string, unknown>,
): TelemetryEvent | undefined {
  if (!Object.prototype.hasOwnProperty.call(TELEMETRY_EVENTS, name)) {
    return undefined;
  }
  const allowed: readonly string[] = TELEMETRY_EVENTS[name as TelemetryEventName];
  const safe: Record<string, TelemetryValue> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (allowed.includes(key) && isSafeValue(value)) {
      safe[key] = value;
    }
  }
  return { name: name as TelemetryEventName, properties: safe };
}
