import { describe, expect, it } from 'vitest';
import { normalizeRedirectSource, normalizeRedirectTarget, resolveFinalTarget } from '@/lib/redirect-rules';
import { brandingSchema, contrastRatio, formsSchema, orderSections, parseConfig } from '@/lib/site-config-schema';
import { sniffImage } from '@/lib/media.functions';
import { previewTokenFrom } from '@/lib/cms-query';

describe('redirect rules', () => {
  it('normalises old WordPress addresses to one matching path', () => {
    expect(normalizeRedirectSource('https://digit-erp.com/Old-Page/?utm=x')).toBe('/old-page');
  });
  it('refuses to redirect the admin or sign-in pages', () => {
    expect(normalizeRedirectSource('/admin')).toBeNull();
    expect(normalizeRedirectSource('/auth/callback')).toBeNull();
  });
  it('refuses to redirect the home pages', () => {
    expect(normalizeRedirectSource('/')).toBeNull();
    expect(normalizeRedirectSource('/en/')).toBeNull();
  });
  it('only allows https for external destinations', () => {
    expect(normalizeRedirectTarget('http://example.com')).toBeNull();
    expect(normalizeRedirectTarget('https://example.com/a')?.kind).toBe('external');
  });
  it('follows existing rules to the final destination', () => {
    expect(resolveFinalTarget('/a', '/b', [{ from_path: '/b', to_path: '/c', enabled: true }])).toBe('/c');
  });
  it('detects loops', () => {
    expect(resolveFinalTarget('/a', '/b', [{ from_path: '/b', to_path: '/a', enabled: true }])).toBeNull();
  });
});

describe('branding rules', () => {
  it('rejects an accent colour below 4.5:1 contrast with white button text', () => {
    expect(brandingSchema.safeParse({ primary: '#9be7c4' }).success).toBe(false);
  });
  it('accepts a dark accent colour', () => {
    expect(contrastRatio('#1d4f91', '#ffffff')).toBeGreaterThan(4.5);
    expect(brandingSchema.safeParse({ primary: '#1d4f91' }).success).toBe(true);
  });
  it('only accepts library images for the logo', () => {
    expect(brandingSchema.safeParse({ logoUrl: 'https://evil.example/logo.png' }).success).toBe(false);
  });
});

describe('form settings', () => {
  it('keeps every optional field visible and optional by default', () => {
    const f = parseConfig('forms', {});
    expect([f.showInterest, f.showRequestType, f.showJobRole, f.showMessage]).toEqual([true, true, true, true]);
    expect([f.requireJobRole, f.requireMessage]).toEqual([false, false]);
  });
  it('limits interest options to 30', () => {
    expect(formsSchema.safeParse({ interestOptions: Array.from({ length: 31 }, () => ({ ar: 'أ', en: 'a' })) }).success).toBe(false);
  });
});

describe('section layout', () => {
  it('keeps new source sections and drops unknown ones', () => {
    expect(orderSections(['hero', 'faq', 'cta'] as const, { sections: [{ id: 'faq', enabled: false }, { id: 'gone', enabled: true }], texts: {} })).toEqual([
      { id: 'faq', enabled: false },
      { id: 'hero', enabled: true },
      { id: 'cta', enabled: true },
    ]);
  });
});

describe('media and preview safety', () => {
  it('rejects SVG uploads by content', () => {
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });
  it('recognises PNG by its signature', () => {
    expect(sniffImage(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))?.mime).toBe('image/png');
  });
  it('ignores malformed preview tokens', () => {
    expect(previewTokenFrom({ preview: 'short' })).toBeUndefined();
    expect(previewTokenFrom({ preview: 'a'.repeat(43) })).toBe('a'.repeat(43));
  });
});
