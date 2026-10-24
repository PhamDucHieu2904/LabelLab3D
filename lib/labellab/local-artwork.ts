// Only Blob URLs created by this session's upload control may enter an appearance.
const owned = new Set<string>();
export function createLocalArtwork(file: Blob) {
  const url = URL.createObjectURL(file);
  owned.add(url);
  return url;
}
export function isLocalArtwork(url: unknown): url is string {
  return typeof url === "string" && owned.has(url);
}
export function releaseLocalArtwork(url: string) {
  if (owned.delete(url)) URL.revokeObjectURL(url);
}
