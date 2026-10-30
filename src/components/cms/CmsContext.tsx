import { createContext,useContext,type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';
import type { PublishedRecord } from '@/lib/cms-schema';
import {CmsRecordsProvider} from './CmsNavigation';
const Context=createContext<PublishedRecord[]>([]);
export function CmsProvider({records,children}:{records:PublishedRecord[];children:ReactNode}){return <CmsRecordsProvider records={records}><Context.Provider value={records}>{children}</Context.Provider></CmsRecordsProvider>}
export function useCmsPage(){const path=useRouterState({select:s=>s.location.pathname.replace(/^\/en(?=\/|$)/,'')||'/'});return useContext(Context).find(r=>r.path===path)?.published;}