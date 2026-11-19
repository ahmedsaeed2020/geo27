/**
 * The catalog index for dashboard rows, read through the app's query cache when one is mounted and fetched once
 * otherwise, so a dashboard renders the same inside the app shell and in isolated screens (print, tests, embeds).
 */
import { useContext, useEffect, useState } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { indexQuery, type IndexEntry } from "@/lib/catalog";

let shared: Promise<IndexEntry[]> | undefined;

export function useCatalogIndex(): IndexEntry[] | undefined {
  const qc = useContext(QueryClientContext);
  const [data, setData] = useState<IndexEntry[] | undefined>(() => qc?.getQueryData(indexQuery.queryKey));
  useEffect(() => {
    if (data) return;
    let live = true;
    const p = qc ? qc.ensureQueryData(indexQuery) : (shared ??= (indexQuery.queryFn as unknown as () => Promise<IndexEntry[]>)());
    void p.then((d) => { if (live) setData(d); }).catch(() => undefined);
    return () => { live = false; };
  }, [qc, data]);
  return data;
}
