import type { StoredArtwork } from "./artwork-store";

/** Return the saved artwork that should seed the editor when reopening it. */
export function getArtworkEditorInitial(
  records: readonly StoredArtwork[],
  selectedId?: string,
): StoredArtwork | undefined {
  return selectedId ? records.find(record => record.id === selectedId) : undefined;
}
