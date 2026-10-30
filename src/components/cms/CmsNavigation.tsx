import {createContext,useContext,type ReactNode} from 'react';
import type {PublishedRecord} from '@/lib/cms-schema';
export const CmsRecordsContext=createContext<PublishedRecord[]>([]);
export function CmsRecordsProvider({records,children}:{records:PublishedRecord[];children:ReactNode}){return <CmsRecordsContext.Provider value={records}>{children}</CmsRecordsContext.Provider>}
export function usePublishedRecords(){return useContext(CmsRecordsContext)}