/** A shared MR can have lines in several projects; count and drill each document once. */
export function openMaterialRequestKpi(groups: readonly { openMr: readonly { name: string }[] }[]) {
  const names = [...new Set(groups.flatMap((group) => group.openMr.map((mr) => mr.name)))];
  return { value: names.length, list: { doctype: "Material Request", filters: [["name", "in", names]] as [string, string, unknown][] } };
}
