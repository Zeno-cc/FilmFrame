export interface ExportCandidate<TItem, TArtifact> {
  item: TItem;
  index: number;
  included: boolean;
  artifact: TArtifact | null;
}

export interface ExportReadyEntry<TItem, TArtifact> {
  item: TItem;
  index: number;
  artifact: TArtifact;
}

export type ExportReadinessStatus = 'empty' | 'complete' | 'incomplete';

export interface ExportReadiness<TItem, TArtifact> {
  status: ExportReadinessStatus;
  totalCount: number;
  readyCount: number;
  pendingCount: number;
  pendingIds: string[];
  readyEntries: ExportReadyEntry<TItem, TArtifact>[];
}

export function evaluateExportReadiness<
  TItem extends { id: string },
  TArtifact,
>(candidates: readonly ExportCandidate<TItem, TArtifact>[]): ExportReadiness<TItem, TArtifact> {
  const included = candidates.filter(candidate => candidate.included);
  const readyEntries = included.flatMap(candidate => candidate.artifact
    ? [{ item: candidate.item, index: candidate.index, artifact: candidate.artifact }]
    : []);
  const pendingIds = included
    .filter(candidate => !candidate.artifact)
    .map(candidate => candidate.item.id);

  return {
    status: included.length === 0
      ? 'empty'
      : pendingIds.length === 0 ? 'complete' : 'incomplete',
    totalCount: included.length,
    readyCount: readyEntries.length,
    pendingCount: pendingIds.length,
    pendingIds,
    readyEntries,
  };
}
