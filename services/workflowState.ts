export type ImageWorkflowStatusKind =
  | 'unprocessed'
  | 'stale'
  | 'queued'
  | 'processing'
  | 'complete'
  | 'failed';

export interface WorkflowImageItem {
  id: string;
  processedUrl?: string;
  processedMime?: string;
  processedSettingsKey?: string;
  processingError?: string;
}

export interface ImageWorkflowContext {
  expectedMime: string;
  expectedSettingsKey: string;
  activeImageId?: string | null;
  queuedImageIds?: readonly string[];
}

export interface ImageWorkflowStatus {
  kind: ImageWorkflowStatusKind;
  label: string;
  detail?: string;
  downloadable: boolean;
}

function hasCurrentArtifact(
  item: WorkflowImageItem,
  context: ImageWorkflowContext,
): boolean {
  return Boolean(
    item.processedUrl &&
    item.processedMime === context.expectedMime &&
    item.processedSettingsKey === context.expectedSettingsKey
  );
}

export function deriveImageWorkflowStatus(
  item: WorkflowImageItem,
  context: ImageWorkflowContext,
): ImageWorkflowStatus {
  const current = hasCurrentArtifact(item, context);

  if (item.processingError) {
    return {
      kind: 'failed',
      label: '失败',
      detail: current ? '处理失败，已保留上次成片' : '处理失败，请重试',
      downloadable: current,
    };
  }

  if (context.activeImageId === item.id) {
    return { kind: 'processing', label: '冲洗中', downloadable: current };
  }

  if (context.queuedImageIds?.includes(item.id)) {
    return { kind: 'queued', label: '等待中', downloadable: current };
  }

  if (current) {
    return { kind: 'complete', label: '已完成', downloadable: true };
  }

  if (item.processedUrl) {
    return {
      kind: 'stale',
      label: '待更新',
      detail: '参数已调整，重新冲洗后生效',
      downloadable: false,
    };
  }

  return { kind: 'unprocessed', label: '未处理', downloadable: false };
}

export function selectImagesForProcessing<T extends WorkflowImageItem>(
  items: readonly T[],
  context: ImageWorkflowContext,
  force = false,
): T[] {
  if (force) return [...items];

  return items.filter((item) => {
    const status = deriveImageWorkflowStatus(item, context);
    return status.kind === 'unprocessed' || status.kind === 'stale' || status.kind === 'failed';
  });
}

export type MoveDirection = 'up' | 'down';

export function moveItem<T extends { id: string }>(
  items: readonly T[],
  itemId: string,
  direction: MoveDirection,
): T[] {
  const index = items.findIndex(item => item.id === itemId);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;

  if (index === -1 || targetIndex < 0 || targetIndex >= items.length) {
    return items as T[];
  }

  const moved = [...items];
  [moved[index], moved[targetIndex]] = [moved[targetIndex], moved[index]];
  return moved;
}

export type PrimaryActionState = 'empty' | 'idle' | 'processing' | 'ready' | 'exporting';
export type PrimaryActionCommand = 'add' | 'process' | 'stop' | 'download' | 'none';

export interface PrimaryAction {
  command: PrimaryActionCommand;
  label: string;
  disabled: boolean;
}

const PRIMARY_ACTIONS: Record<PrimaryActionState, PrimaryAction> = {
  empty: { command: 'add', label: '添加照片', disabled: false },
  idle: { command: 'process', label: '开始冲洗', disabled: false },
  processing: { command: 'stop', label: '停止后续', disabled: false },
  ready: { command: 'download', label: '下载成片', disabled: false },
  exporting: { command: 'none', label: '正在打包', disabled: true },
};

export function getPrimaryAction(state: PrimaryActionState): PrimaryAction {
  return PRIMARY_ACTIONS[state];
}

export interface ImageTaskContext {
  mounted: boolean;
  resultGeneration: string | number;
  currentGeneration: string | number;
  itemExists: boolean;
}

export function isImageTaskContextCurrent(context: ImageTaskContext): boolean {
  return context.mounted
    && context.resultGeneration === context.currentGeneration
    && context.itemExists;
}

export function isImageRemovalAllowed(
  processing: boolean,
  outputMode: 'single' | 'strip',
  exporting: boolean,
): boolean {
  return !exporting && !(processing && outputMode === 'strip');
}
