import { describe, it, expect } from 'vitest';
import { accessibleHtml } from '@/lib/accessible-html';

describe('Imported icons and assistive technology', () => {
  it('hides an unnamed decorative SVG, including one with an empty label', () => {
    const out = accessibleHtml('<span><svg aria-label="" height="22" role="img" viewBox="0 0 100 100"><rect></rect></svg></span>');
    expect(out).toBe('<span><svg height="22" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><rect></rect></svg></span>');
  });

  it('drops the image role from an unnamed wrapper but keeps the wrapper', () => {
    expect(accessibleHtml('<div class="ic" role="img"><i></i></div>')).toBe('<div class="ic"><i></i></div>');
  });

  it('leaves named images untouched', () => {
    const named = '<svg role="img" aria-label="Digit"><rect></rect></svg>';
    const titled = '<svg role="img"><title>Digit</title></svg>';
    expect(accessibleHtml(named)).toBe(named);
    expect(accessibleHtml(titled)).toBe(titled);
  });
});
