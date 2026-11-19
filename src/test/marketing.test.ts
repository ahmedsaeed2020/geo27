import { describe, expect, it } from 'vitest';
import { attributionParams, campaignUrl, integrationSettingsSchema, leadAttribution } from '@/lib/marketing';
import { tabsFor } from '@/components/cms/admin/tabs';

describe('campaign attribution', () => {
  for (const source of ['facebook', 'google', 'linkedin', 'x']) {
    it(`keeps ${source} and its campaign on a generated link`, () => {
      const url = campaignUrl('https://example.com/en?from=/en', source, 'paid_social', 'launch');
      expect(leadAttribution(attributionParams(new URL(url).search))).toEqual({ source, campaign: 'launch', medium: 'paid_social' });
      expect(new URL(url).searchParams.get('from')).toBe('/en');
    });
  }
  it('keeps click identifiers but excludes arbitrary query fields', () => {
    expect(attributionParams('?gclid=google-click&fbclid=meta-click&email=private')).toEqual({ gclid: 'google-click', fbclid: 'meta-click' });
  });
  it('normalizes Instagram campaigns as Facebook traffic', () => {
    expect(leadAttribution({ utm_source: 'instagram' }).source).toBe('facebook');
  });
  it('recognizes LinkedIn referrals without a campaign', () => {
    expect(leadAttribution({}, 'https://www.linkedin.com/feed').source).toBe('linkedin');
  });
  it('does not claim direct traffic belongs to a known campaign', () => {
    expect(leadAttribution({})).toEqual({ source: 'direct', campaign: '', medium: '' });
  });
});

describe('integration preparation', () => {
  it('stores only identifiers and never enables tracking or delivery', () => {
    const settings = integrationSettingsSchema.parse({ enabled: true, apiKey: 'must-not-save', analytics: { measurementId: 'G-123ABC', enabled: true } });
    expect(settings.analytics).toEqual({ measurementId: 'G-123ABC', propertyId: '' });
    expect(settings).not.toHaveProperty('enabled');
    expect(settings).not.toHaveProperty('apiKey');
  });
  it('rejects a script in a measurement identifier', () => {
    expect(integrationSettingsSchema.safeParse({ analytics: { measurementId: '<script>' } }).success).toBe(false);
  });
  it('restricts integration editing to the owner', () => {
    expect(tabsFor('owner').map(t => t.id)).toContain('integrations');
    expect(tabsFor('sales').map(t => t.id)).not.toContain('integrations');
    expect(tabsFor('editor').map(t => t.id)).not.toContain('integrations');
  });
});