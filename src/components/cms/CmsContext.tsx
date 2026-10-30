import { createContext,useContext,type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';
import type { PublishedRecord } from '@/lib/cms-schema';
const Context=createContext<PublishedRecord[]>([]);
export function CmsProvider({records,children}:{records:PublishedRecord[];children:ReactNode}){return <Context.Provider value={records}>{children}</Context.Provider>}
export function useCmsPage(){const path=useRouterState({select:s=>s.location.pathname.replace(/^\/en(?=\/|$)/,'')||'/'});return useContext(Context).find(r=>r.path===path)?.published;}