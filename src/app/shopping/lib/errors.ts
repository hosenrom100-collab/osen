/** True for the error Firestore raises when a security rule rejects the write. */
export function isPermissionDenied(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "permission-denied";
}
