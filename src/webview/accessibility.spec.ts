import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGES = ['src/webview/html.ts', 'src/issueForm/html.ts'];

function source(path: string): string {
  return readFileSync(join(__dirname, '..', '..', path), 'utf8');
}

describe.each(PAGES)('accessibility of %s', (page) => {
  const html = source(page);

  it('gives every form control an accessible name', () => {
    const controls = [...html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)];
    expect(controls.length).toBeGreaterThan(0);

    for (const [, , attributes] of controls) {
      const id = attributes.match(/\bid="([^"]+)"/)?.[1];
      const named =
        /\baria-label="[^"]+"/.test(attributes) ||
        /\baria-labelledby="[^"]+"/.test(attributes) ||
        (id !== undefined && new RegExp(`<label[^>]*\\bfor="${id}"`).test(html));
      expect(named, `control #${id} has no label`).toBe(true);
    }
  });

  it('gives every button text or an aria-label', () => {
    for (const [, attributes, text] of html.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)) {
      const id = attributes.match(/\bid="([^"]+)"/)?.[1];
      expect(
        text.trim().length > 0 || /\baria-label="[^"]+"/.test(attributes),
        `button #${id} has no name`,
      ).toBe(true);
    }
  });

  it('gives every <details> a <summary> and every <ul> a name', () => {
    const detailsCount = (html.match(/<details\b/g) ?? []).length;
    const summaryCount = (html.match(/<summary\b/g) ?? []).length;
    expect(summaryCount).toBeGreaterThanOrEqual(detailsCount);
    for (const [, attributes] of html.matchAll(/<ul\b([^>]*)>/g)) {
      expect(/aria-label(ledby)?=/.test(attributes)).toBe(true);
    }
  });

  it('has a main landmark and announces errors', () => {
    expect(html).toMatch(/<main\b[^>]*aria-label=/);
    expect(html).toMatch(/role="alert"/);
  });

  it('exposes the preview as a labelled, keyboard-reachable region', () => {
    expect(html).toMatch(
      /id="preview"[^>]*role="region"[^>]*aria-labelledby="previewLabel"[^>]*tabindex="0"/,
    );
  });
});

describe('styles', () => {
  const styles = source('src/webview/styles.ts');

  it('keeps a visible keyboard focus indicator and handles high contrast', () => {
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('vscode-high-contrast');
    expect(styles).toContain('forced-colors');
  });
});
