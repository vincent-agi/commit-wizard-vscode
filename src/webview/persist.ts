/** A form control whose value survives a webview reload. */
export type PersistedControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Serializable snapshot of form controls, keyed by element id. */
export type FormSnapshot = Record<string, string | boolean>;

/** Reads the current value (or checked state) of each control. */
export function snapshotControls(controls: readonly PersistedControl[]): FormSnapshot {
  const snapshot: FormSnapshot = {};
  for (const control of controls) {
    snapshot[control.id] =
      control instanceof HTMLInputElement && control.type === 'checkbox'
        ? control.checked
        : control.value;
  }
  return snapshot;
}

/**
 * Writes a snapshot back into the controls. Unknown ids and malformed values are ignored, and a
 * `<select>` keeps its current value when the saved one is no longer one of its options.
 */
export function restoreControls(controls: readonly PersistedControl[], snapshot: unknown): void {
  if (typeof snapshot !== 'object' || snapshot === null) {
    return;
  }
  const saved = snapshot as Record<string, unknown>;
  for (const control of controls) {
    const value = saved[control.id];
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      if (typeof value === 'boolean') control.checked = value;
    } else if (typeof value === 'string') {
      if (control instanceof HTMLSelectElement) {
        if (Array.from(control.options).some((option) => option.value === value)) {
          control.value = value;
        }
      } else {
        control.value = value;
      }
    }
  }
}
