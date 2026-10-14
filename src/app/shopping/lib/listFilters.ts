export type ListType = "supermarket" | "large";

/** Items without a `listType` (older documents) belong to the supermarket list. */
export function belongsToList(item: { listType?: string | null }, listType: ListType): boolean {
  return listType === "large" ? item.listType === "large" : item.listType !== "large";
}
