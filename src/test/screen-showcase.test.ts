import { describe, it, expect } from 'vitest';
import { nativeWidth } from '@/content/product-shots';
import { CRM_SHOTS, CONSTRUCTION_SHOTS } from '@/content/specialist/specialist-shots';
import { HR_SHOTS } from '@/content/hr/hr-shots';
import { CRM } from '@/content/specialist/crm';
import { splitCaption } from '@/components/product/ScreenMosaic';

// Owner 2026-11-05: the old multi-screen frame blew a CRM menu crop up to giant text. Screens in the showcase are
// never shown larger than they appeared on the original (retina) display.
describe('screen showcase', () => {
  it('caps CRM, Construction and HR captures at their original on-screen width', () => {
    for (const shot of [...Object.values(CRM_SHOTS), ...Object.values(CONSTRUCTION_SHOTS), ...Object.values(HR_SHOTS)]) {
      expect(shot.density, shot.id).toBe(2);
    }
    expect(nativeWidth(CRM_SHOTS['crm2-nav-reports']!)).toBe(286);
    expect(nativeWidth(CRM_SHOTS['crm2-exec-cards']!)).toBe(1200);
  });

  it('presents each caption as a headline with its supporting line', () => {
    expect(splitCaption('مؤشرات الإدارة العليا: إجمالي خط الأنابيب المفتوح', 'ar')).toEqual({ title: 'مؤشرات الإدارة العليا', detail: 'إجمالي خط الأنابيب المفتوح' });
    expect(splitCaption('Leads by source: website, WhatsApp campaigns', 'en')).toEqual({ title: 'Leads by source', detail: 'Website, WhatsApp campaigns' });
    expect(splitCaption('«لماذا لا يمكن ترحيله؟» مع السبب', 'ar')).toEqual({ title: '«لماذا لا يمكن ترحيله؟» مع السبب' });
  });

  it('opens every CRM area showcase on a full chart rather than a thin indicator strip', () => {
    for (const d of CRM.filter(x => x.mosaic?.length)) {
      const first = CRM_SHOTS[d.mosaic![0]!]!;
      expect(first.width / first.height, d.slug).toBeLessThan(3.5);
    }
  });
});
