import {describe,it,expect} from 'vitest';
import {leadSchema,LEAD_RECIPIENT} from '@/lib/leads-schema';
import {canPerform,safePath} from '@/lib/cms-schema';
import stories from '@/content/v3/feature-stories.json';
const valid={name:'Synthetic Test',company:'Test Business',email:'test@example.com',phone:'',interest:'Finance',requestType:'demo',jobRole:'',message:'',locale:'ar',pagePath:'/modules/accounting',consent:true};
describe('V3 business and permission rules',()=>{
 it('uses the approved notification recipient',()=>expect(LEAD_RECIPIENT).toBe('a.saeed@trilogy.com.sa'));
 it('rejects a request without any reachable channel',()=>expect(leadSchema.safeParse({...valid,email:''}).success).toBe(false));
 it('accepts email-only contact',()=>expect(leadSchema.safeParse(valid).success).toBe(true));
 it('accepts telephone-only contact',()=>expect(leadSchema.safeParse({...valid,email:'',phone:'+966595051150'}).success).toBe(true));
 it('requires consent',()=>expect(leadSchema.safeParse({...valid,consent:false}).success).toBe(false));
 it('editors cannot access leads',()=>expect(canPerform('editor','leads')).toBe(false));
 it('sales cannot edit content',()=>expect(canPerform('sales','content')).toBe(false));
 it('reserves protected route namespaces',()=>expect(safePath.safeParse('/admin/private').success).toBe(false));
 it('retains exactly all 42 evidence-gated stories',()=>{expect(stories).toHaveLength(42);expect(stories.every(s=>s.evidence_status==='pending')).toBe(true)});
});