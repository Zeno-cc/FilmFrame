import type { ImageItem } from '../types';
import {
  validateCanvasBudget,
  type RenderBudgetLimits,
  type RenderBudgetResult,
} from './renderBudget';
import { MAX_ZIP_INPUT_BYTES } from './zip';

export const RGBA_BYTES_PER_PIXEL = 4;
export const MEBIBYTE = 1024 * 1024;

/**
 * These are guardrails, not a claim about a browser's exact memory use. The
 * work-set estimate keeps one decoded RGBA source and one similarly sized
 * processing copy alive; strip output adds its canvas separately below.
 */
export const BATCH_ADMISSION_LIMITS = {
  sourcePixelsWarning: 80_000_000,
  sourcePixelsBlocked: 160_000_000,
  workingSetMultiplier: 2,
  workingBytesWarning: 512 * MEBIBYTE,
  workingBytesBlocked: 1024 * MEBIBYTE,
  zipInputBytesWarning: 192 * MEBIBYTE,
  zipInputBytesBlocked: MAX_ZIP_INPUT_BYTES,
} as const;

export type BatchAdmissionOperation = 'process' | 'strip' | 'zip';
export type BatchAdmissionStatus = 'ok' | 'warning' | 'blocked';
export type BatchAdmissionReason =
  | 'empty-selection'
  | 'invalid-source-dimensions'
  | 'source-pixels-warning'
  | 'source-pixels-exceeded'
  | 'working-set-warning'
  | 'working-set-exceeded'
  | 'invalid-strip-canvas'
  | 'strip-canvas-exceeded'
  | 'invalid-zip-input'
  | 'zip-input-warning'
  | 'zip-input-exceeded';

export type BatchAdmissionAction =
  | 'select-images'
  | 'remove-largest-images'
  | 'use-preview-mode';

export type BatchAdmissionImage = Pick<ImageItem, 'sourceWidth' | 'sourceHeight'>;

export type BatchAdmissionBaseInput = {
  includedImages: readonly BatchAdmissionImage[];
  totalImageCount?: number;
  canvasLimits?: RenderBudgetLimits;
};

export type BatchAdmissionInput =
  | (BatchAdmissionBaseInput & { operation: 'process' })
  | (BatchAdmissionBaseInput & {
    operation: 'strip';
    stripCanvas: BatchAdmissionCanvas;
  })
  | (BatchAdmissionBaseInput & {
    operation: 'zip';
    /** Omit this before artifact Blob sizes have been read. */
    zipInputBytes?: number;
  });

export type BatchAdmissionCanvas = {
  width: number;
  height: number;
};

export type BatchAdmissionCanvasEstimate = BatchAdmissionCanvas & {
  pixels: number;
  estimatedBytes: number;
  budget: RenderBudgetResult;
};

export type BatchAdmissionResult = {
  status: BatchAdmissionStatus;
  /** The highest-priority machine-readable reason, if the batch needs attention. */
  reason?: BatchAdmissionReason;
  reasons: readonly BatchAdmissionReason[];
  includedCount: number;
  totalImageCount: number;
  sourcePixels: number;
  decodedSourceBytes: number;
  estimatedWorkingBytes: number;
  stripCanvas?: BatchAdmissionCanvasEstimate;
  zipInputBytes?: number;
  recommendations: readonly BatchAdmissionAction[];
};

const BLOCKING_REASONS = new Set<BatchAdmissionReason>([
  'empty-selection',
  'invalid-source-dimensions',
  'source-pixels-exceeded',
  'working-set-exceeded',
  'invalid-strip-canvas',
  'strip-canvas-exceeded',
  'invalid-zip-input',
  'zip-input-exceeded',
]);

function isValidSourceDimension(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function normalizedTotalImageCount(totalImageCount: number | undefined, includedCount: number): number {
  return typeof totalImageCount === 'number'
    && Number.isSafeInteger(totalImageCount)
    && totalImageCount >= includedCount
    ? totalImageCount
    : includedCount;
}

function sourceMetrics(images: readonly BatchAdmissionImage[]): {
  valid: boolean;
  pixels: number;
} {
  let pixels = 0;

  for (const image of images) {
    if (!isValidSourceDimension(image.sourceWidth) || !isValidSourceDimension(image.sourceHeight)) {
      return { valid: false, pixels: 0 };
    }

    const imagePixels = image.sourceWidth * image.sourceHeight;
    if (!Number.isSafeInteger(imagePixels) || !Number.isSafeInteger(pixels + imagePixels)) {
      return { valid: false, pixels: 0 };
    }
    pixels += imagePixels;
  }

  return { valid: true, pixels };
}

function recommendationsFor(reasons: readonly BatchAdmissionReason[]): BatchAdmissionAction[] {
  const actions = new Set<BatchAdmissionAction>();

  for (const reason of reasons) {
    switch (reason) {
      case 'empty-selection':
        actions.add('select-images');
        break;
      case 'invalid-source-dimensions':
        actions.add('remove-largest-images');
        break;
      case 'source-pixels-warning':
      case 'source-pixels-exceeded':
      case 'working-set-warning':
      case 'working-set-exceeded':
        actions.add('select-images');
        actions.add('remove-largest-images');
        actions.add('use-preview-mode');
        break;
      case 'invalid-strip-canvas':
      case 'strip-canvas-exceeded':
        actions.add('select-images');
        actions.add('use-preview-mode');
        break;
      case 'invalid-zip-input':
      case 'zip-input-warning':
      case 'zip-input-exceeded':
        actions.add('select-images');
        actions.add('remove-largest-images');
        break;
    }
  }

  return [...actions];
}

function resultFrom(
  reasons: BatchAdmissionReason[],
  metrics: Omit<BatchAdmissionResult, 'status' | 'reason' | 'reasons' | 'recommendations'>,
): BatchAdmissionResult {
  const blockingReason = reasons.find(reason => BLOCKING_REASONS.has(reason));
  const status: BatchAdmissionStatus = blockingReason
    ? 'blocked'
    : reasons.length > 0
      ? 'warning'
      : 'ok';

  return {
    ...metrics,
    status,
    reason: blockingReason ?? reasons[0],
    reasons,
    recommendations: recommendationsFor(reasons),
  };
}

/**
 * Evaluates only the image subset which will enter an expensive operation.
 * It is intentionally DOM-free: callers derive exact strip dimensions and
 * pass known ZIP artifact bytes without creating a Canvas or fetching Blobs.
 */
export function evaluateBatchAdmission(input: BatchAdmissionInput): BatchAdmissionResult {
  const includedCount = input.includedImages.length;
  const totalImageCount = normalizedTotalImageCount(input.totalImageCount, includedCount);
  const baseMetrics = {
    includedCount,
    totalImageCount,
    sourcePixels: 0,
    decodedSourceBytes: 0,
    estimatedWorkingBytes: 0,
  };

  if (includedCount === 0) {
    return resultFrom(['empty-selection'], baseMetrics);
  }

  const source = sourceMetrics(input.includedImages);
  if (!source.valid && input.operation !== 'zip') {
    return resultFrom(['invalid-source-dimensions'], baseMetrics);
  }

  const sourcePixels = source.valid ? source.pixels : 0;
  const decodedSourceBytes = sourcePixels * RGBA_BYTES_PER_PIXEL;
  const sourceWorksetBytes = decodedSourceBytes * BATCH_ADMISSION_LIMITS.workingSetMultiplier;
  if (
    input.operation !== 'zip'
    && (!Number.isSafeInteger(decodedSourceBytes) || !Number.isSafeInteger(sourceWorksetBytes))
  ) {
    return resultFrom(['invalid-source-dimensions'], baseMetrics);
  }
  const reasons: BatchAdmissionReason[] = [];
  let stripCanvas: BatchAdmissionCanvasEstimate | undefined;
  let zipInputBytes: number | undefined;
  let estimatedWorkingBytes = input.operation === 'zip' ? 0 : sourceWorksetBytes;

  if (input.operation !== 'zip') {
    if (sourcePixels >= BATCH_ADMISSION_LIMITS.sourcePixelsBlocked) {
      reasons.push('source-pixels-exceeded');
    } else if (sourcePixels >= BATCH_ADMISSION_LIMITS.sourcePixelsWarning) {
      reasons.push('source-pixels-warning');
    }
  }

  if (input.operation === 'strip') {
    const budget = validateCanvasBudget(
      input.stripCanvas.width,
      input.stripCanvas.height,
      input.canvasLimits,
    );
    const pixels = budget.pixels;
    const estimatedBytes = pixels * RGBA_BYTES_PER_PIXEL;
    stripCanvas = {
      ...input.stripCanvas,
      pixels,
      estimatedBytes,
      budget,
    };

    if (!budget.ok) {
      reasons.push(
        budget.reason === 'invalid-dimensions'
          ? 'invalid-strip-canvas'
          : 'strip-canvas-exceeded',
      );
    }
    estimatedWorkingBytes += estimatedBytes;
  }

  if (input.operation !== 'zip') {
    // A strip keeps its output canvas alongside decoded source and processing
    // buffers, so classify the final work set rather than the source alone.
    if (estimatedWorkingBytes >= BATCH_ADMISSION_LIMITS.workingBytesBlocked) {
      reasons.push('working-set-exceeded');
    } else if (estimatedWorkingBytes >= BATCH_ADMISSION_LIMITS.workingBytesWarning) {
      reasons.push('working-set-warning');
    }
  }

  if (input.operation === 'zip') {
    zipInputBytes = input.zipInputBytes;
    if (zipInputBytes !== undefined && (!Number.isSafeInteger(zipInputBytes) || zipInputBytes < 0)) {
      reasons.push('invalid-zip-input');
    } else if (zipInputBytes !== undefined && zipInputBytes > BATCH_ADMISSION_LIMITS.zipInputBytesBlocked) {
      reasons.push('zip-input-exceeded');
    } else if (zipInputBytes !== undefined && zipInputBytes >= BATCH_ADMISSION_LIMITS.zipInputBytesWarning) {
      reasons.push('zip-input-warning');
    }
  }

  return resultFrom(reasons, {
    includedCount,
    totalImageCount,
    sourcePixels,
    decodedSourceBytes,
    estimatedWorkingBytes,
    stripCanvas,
    zipInputBytes,
  });
}

export function formatBatchAdmissionBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '未知大小';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MEBIBYTE) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < MEBIBYTE * 1024) return `${(bytes / MEBIBYTE).toFixed(1)} MiB`;
  return `${(bytes / (MEBIBYTE * 1024)).toFixed(1)} GiB`;
}

/** Provides display copy without duplicating threshold logic in a component. */
export function formatBatchAdmission(result: BatchAdmissionResult): string {
  const selected = `本次准入 ${result.includedCount}/${result.totalImageCount} 张`;

  switch (result.reason) {
    case 'empty-selection':
      return '请先选择至少一张照片。';
    case 'invalid-source-dimensions':
      return `${selected}，其中包含无法用于容量估算的图片尺寸。`;
    case 'source-pixels-warning':
    case 'working-set-warning':
      return `${selected}，源图解码约 ${formatBatchAdmissionBytes(result.decodedSourceBytes)}，预计工作集约 ${formatBatchAdmissionBytes(result.estimatedWorkingBytes)}。`;
    case 'source-pixels-exceeded':
    case 'working-set-exceeded':
      return `${selected}，预计工作集约 ${formatBatchAdmissionBytes(result.estimatedWorkingBytes)}，超过本次安全准入上限。`;
    case 'invalid-strip-canvas':
      return '长条画布尺寸无效，无法开始拼合。';
    case 'strip-canvas-exceeded':
      return `长条画布约 ${formatBatchAdmissionBytes(result.stripCanvas?.estimatedBytes ?? 0)}，超过浏览器安全上限。`;
    case 'invalid-zip-input':
      return 'ZIP 输入大小无效，无法开始打包。';
    case 'zip-input-warning':
      return `ZIP 输入约 ${formatBatchAdmissionBytes(result.zipInputBytes ?? 0)}，接近安全上限。`;
    case 'zip-input-exceeded':
      return `ZIP 输入约 ${formatBatchAdmissionBytes(result.zipInputBytes ?? 0)}，超过 ${formatBatchAdmissionBytes(BATCH_ADMISSION_LIMITS.zipInputBytesBlocked)} 安全上限。`;
    default:
      return `${selected}，源图解码约 ${formatBatchAdmissionBytes(result.decodedSourceBytes)}。`;
  }
}
