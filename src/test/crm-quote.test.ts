import { describe,it,expect } from 'vitest';
import { quoteTotals } from '@/lib/crm-schema';
describe('CRM quotation totals',()=>{
  it('adds 15% VAT after discount',()=>{expect(quoteTotals({items:[{qty:2,price:500}],discount:100})).toEqual({subtotal:1000,net:900,vat:135,total:1035});});
});
