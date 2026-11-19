import { describe, expect, it } from 'vitest';
import { GEO_CHALLENGES, GEO_COPY, GEO_WHATSAPP } from '@/content/geointime';
import { geoWhatsAppMessage, geoWhatsAppUrl, isGeoChallenge, isValidGeoPhone } from '@/lib/geointime-lead';
import { leadSchema } from '@/lib/leads-schema';

const lead = { name: 'أحمد سعيد', company: 'شركة المثال', phone: '0551234567', role: '', challenge: 'overtime' as const };

describe('GeoInTime landing lead rules', () => {
  it('prepares WhatsApp messages for the official GeoInTime number', () => {
    expect(GEO_WHATSAPP).toBe('966595051150');
    expect(geoWhatsAppUrl()).toBe('https://wa.me/966595051150');
    expect(geoWhatsAppUrl('hi')).toBe('https://wa.me/966595051150?text=hi');
  });

  it('builds the V5 message lines with the chosen scenario and a default role', () => {
    expect(geoWhatsAppMessage('ar', lead).split('\n')).toEqual([
      'طلب عرض توضيحي — GeoInTime', 'الاسم: أحمد سعيد', 'الشركة: شركة المثال', 'الجوال: 0551234567', 'الدور: غير محدد', 'السيناريو: مراجعة الساعات الإضافية',
    ]);
    expect(geoWhatsAppMessage('en', { ...lead, role: 'Operations' })).toContain('Scenario: Overtime review');
  });

  it('accepts Saudi mobile formats and rejects short or lettered numbers', () => {
    expect(isValidGeoPhone('0551234567')).toBe(true);
    expect(isValidGeoPhone('+966 55 123 4567')).toBe(true);
    expect(isValidGeoPhone('12345')).toBe(false);
    expect(isValidGeoPhone('05abc12345')).toBe(false);
  });

  it('offers the five V5 challenges and links each situation to one of them', () => {
    expect(GEO_CHALLENGES).toEqual(['sites', 'presence', 'tasks', 'overtime', 'other']);
    for (const locale of ['ar', 'en'] as const) {
      const scenarios = GEO_COPY[locale].scenarios.items;
      expect(scenarios).toHaveLength(4);
      expect(scenarios.map(s => s.challenge)).toEqual(['sites', 'presence', 'tasks', 'overtime']);
      for (const s of scenarios) expect(GEO_COPY[locale].experience.groups[s.proof[0]].views.some(v => v.key === s.proof[1])).toBe(true);
    }
    expect(isGeoChallenge('other')).toBe(true);
    expect(isGeoChallenge('payroll')).toBe(false);
  });

  it('sends a landing request the shared lead store accepts without an email', () => {
    const parsed = leadSchema.safeParse({ name: lead.name, company: lead.company, email: '', phone: lead.phone, interest: 'GeoInTime · Overtime review', requestType: 'demo', jobRole: '', message: 'GeoInTime — Overtime review', locale: 'ar', pagePath: '/', product: '', department: '', topic: '', consent: true, website: '' });
    expect(parsed.success).toBe(true);
  });

  it('never presents the landing as a trial or temporary page', () => {
    const text = JSON.stringify(GEO_COPY);
    for (const banned of ['تجريبي', 'مؤقت', 'نموذج تصميم', 'prototype', 'DIGIT', 'Digit']) expect(text).not.toContain(banned);
  });
});
