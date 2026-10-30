import { z } from 'zod';
export const safePath = z.string().regex(/^\/(?:[a-z0-9][a-z0-9/-]*)?$/).max(240).refine(v => !/^\/(admin|auth|api|lovable|_)/.test(v));
export const blockSchema = z.object({ id:z.string().max(80), type:z.enum(['story','workflow','faq','resource','cta']), title:z.string().max(200), body:z.string().max(6000), shotId:z.string().max(100).default(''), href:z.string().max(240).default(''), enabled:z.boolean().default(true) });
export const localeSchema = z.object({title:z.string().max(200),description:z.string().max(500),blocks:z.array(blockSchema).max(60),sourceEdits:z.record(z.string().max(10000)).default({})});
export const cmsContentSchema = z.object({ar:localeSchema,en:localeSchema,indexable:z.boolean().default(true),evidence:z.enum(['approved','pending']).default('pending'),formEnabled:z.boolean().default(true),ogImage:z.string().max(1000).default(''),canonical:z.string().max(240).default('')});
export type CmsContent = z.infer<typeof cmsContentSchema>;
export type CmsBlock = z.infer<typeof blockSchema>;
export type PublishedRecord = {path:string;kind:string;published:CmsContent;published_at:string|null};
export const canPerform = (role:string, scope:string) => role==='owner' || (role==='editor' && scope==='content') || (role==='sales' && scope==='leads');