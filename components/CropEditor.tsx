import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RenderTransform } from '../types';
import {
  changeZoomPreservingPoint,
  changeZoomPreservingView,
  createCoverPlacement,
  getVisibleFrameAspect,
  normalizeRenderTransform,
  type NormalizedRenderTransform,
} from '../services/renderTransform';
import { ResetIcon, RotateCwIcon } from './icons/FilmFrameIcons';
import { Button, IconButton } from './ui';

type Size = { width: number; height: number };

interface CropEditorProps {
  sourceUrl: string;
  initialTransform?: RenderTransform;
  landscapeFrameAspect?: number;
  onCancel: () => void;
  onCommit: (transform: NormalizedRenderTransform) => void;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function formatAspect(aspect: number): string {
  if (!Number.isFinite(aspect) || aspect <= 0) return '—';
  const known = [
    [1, '1:1'],
    [4 / 3, '4:3'],
    [3 / 2, '3:2'],
    [16 / 9, '16:9'],
  ] as const;
  const match = known.find(([ratio]) => Math.abs(aspect - ratio) < 0.01);
  if (match) return match[1];
  return aspect >= 1 ? `${aspect.toFixed(2)}:1` : `1:${(1 / aspect).toFixed(2)}`;
}

function imageTransform(placement: ReturnType<typeof createCoverPlacement>): string | undefined {
  switch (placement.totalQuarterTurns) {
    case 1: return `translate(${placement.drawWidth}px, 0) rotate(90deg)`;
    case 2: return `translate(${placement.drawWidth}px, ${placement.drawHeight}px) rotate(180deg)`;
    case 3: return `translate(0, ${placement.drawHeight}px) rotate(-90deg)`;
    default: return undefined;
  }
}

export default function CropEditor({ sourceUrl, initialTransform, landscapeFrameAspect, onCancel, onCommit }: CropEditorProps) {
  const [draft, setDraft] = useState(() => normalizeRenderTransform(initialTransform));
  const [imageSize, setImageSize] = useState<Size | null>(null);
  const [stageSize, setStageSize] = useState<Size>({ width: 0, height: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft);
  const imageSizeRef = useRef<Size | null>(imageSize);
  const viewportSizeRef = useRef<Size>({ width: 0, height: 0 });
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    focusX: number;
    focusY: number;
    overflowX: number;
    overflowY: number;
  } | null>(null);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const update = () => setStageSize({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => viewportRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const numericAspect = imageSize
    ? getVisibleFrameAspect(imageSize.width, imageSize.height, draft.quarterTurns, landscapeFrameAspect)
    : landscapeFrameAspect ?? 1.5;
  const sourceAspect = imageSize
    ? getVisibleFrameAspect(imageSize.width, imageSize.height, draft.quarterTurns)
    : null;
  const aspectRatio = String(numericAspect);
  const viewportSize = useMemo(() => {
    if (stageSize.width === 0 || stageSize.height === 0) return { width: 0, height: 0 };
    const width = Math.min(stageSize.width - 8, (stageSize.height - 8) * numericAspect);
    return { width: Math.max(0, width), height: Math.max(0, width / numericAspect) };
  }, [numericAspect, stageSize]);
  draftRef.current = draft;
  imageSizeRef.current = imageSize;
  viewportSizeRef.current = viewportSize;

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const handleWheel = (event: WheelEvent) => {
      const currentImageSize = imageSizeRef.current;
      const currentViewportSize = viewportSizeRef.current;
      if (!currentImageSize || currentViewportSize.width <= 0 || currentViewportSize.height <= 0) return;

      event.preventDefault();
      const deltaPixels = event.deltaY * (
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? currentViewportSize.height
            : 1
      );
      const nextZoom = draftRef.current.zoom * Math.exp(-deltaPixels * 0.0015);
      const bounds = element.getBoundingClientRect();
      setDraft(changeZoomPreservingPoint(
        currentImageSize.width,
        currentImageSize.height,
        currentViewportSize.width,
        currentViewportSize.height,
        draftRef.current,
        nextZoom,
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      ));
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, []);
  const placement = useMemo(() => {
    if (!imageSize || viewportSize.width === 0 || viewportSize.height === 0) return null;
    return createCoverPlacement(
      imageSize.width,
      imageSize.height,
      viewportSize.width,
      viewportSize.height,
      draft,
    );
  }, [draft, imageSize, viewportSize]);
  const canPan = Boolean(placement && (
    placement.drawWidth - viewportSize.width > 0.5
    || placement.drawHeight - viewportSize.height > 0.5
  ));

  const nudge = (deltaX: number, deltaY: number) => {
    setDraft(current => normalizeRenderTransform({
      ...current,
      focusX: clamp(current.focusX + deltaX),
      focusY: clamp(current.focusY + deltaY),
    }));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.focus({ preventScroll: true });
    if (!placement || !canPan) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      focusX: draft.focusX,
      focusY: draft.focusY,
      overflowX: Math.max(0, placement.drawWidth - viewportSize.width),
      overflowY: Math.max(0, placement.drawHeight - viewportSize.height),
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextX = drag.overflowX > 0
      ? clamp(drag.focusX - (event.clientX - drag.x) / drag.overflowX)
      : drag.focusX;
    const nextY = drag.overflowY > 0
      ? clamp(drag.focusY - (event.clientY - drag.y) / drag.overflowY)
      : drag.focusY;
    setDraft(current => normalizeRenderTransform({ ...current, focusX: nextX, focusY: nextY }));
  };

  const finishPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section data-crop-editor className="mx-auto flex h-full min-h-0 w-full max-w-[1180px] flex-1 flex-col gap-3 py-1 md:py-2">
      <header className="flex shrink-0 items-center justify-between px-1">
        <div>
          <p className="font-mono text-[10px] text-[var(--ff-amber)]" aria-hidden="true">FRAME · CROP</p>
          <h2 className="mt-1 text-sm font-semibold text-[var(--ff-paper)]">调整构图</h2>
          <div data-crop-aspect className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[var(--ff-paper-dim)]">
            <span>照片 {sourceAspect ? formatAspect(sourceAspect) : '加载中'}</span>
            {typeof landscapeFrameAspect === 'number' && (
              <>
                <span aria-hidden="true">→</span>
                <span>片窗 {formatAspect(numericAspect)}</span>
              </>
            )}
          </div>
        </div>
        <output className="font-mono text-xs text-[var(--ff-paper-muted)]" aria-live="polite">{Math.round(draft.zoom * 100)}%</output>
      </header>

      <div
        ref={stageRef}
        data-crop-stage
        className="relative flex min-h-[180px] w-full flex-1 items-center justify-center overflow-hidden rounded-[6px] border border-[var(--ff-line-soft)] bg-[var(--ff-bg-deep)] px-1 py-1 md:min-h-[260px]"
      >
        <div
          ref={viewportRef}
          role="region"
          tabIndex={0}
          aria-label={canPan
            ? '裁切预览，拖动照片、滚轮缩放或使用方向键调整位置'
            : '裁切预览，当前构图已居中；放大后可拖动照片'}
          data-crop-viewport
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
          onKeyDown={event => {
            const step = event.shiftKey ? 0.1 : 0.02;
            if (event.key === 'ArrowLeft') nudge(step, 0);
            else if (event.key === 'ArrowRight') nudge(-step, 0);
            else if (event.key === 'ArrowUp') nudge(0, step);
            else if (event.key === 'ArrowDown') nudge(0, -step);
            else return;
            event.preventDefault();
          }}
          className={`crop-viewport relative shrink-0 touch-none overflow-hidden border border-[var(--ff-paper)] bg-[var(--ff-bg-deep)] shadow-[0_12px_32px_rgba(0,0,0,.34)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ff-focus)] ${canPan ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
          style={{ aspectRatio, width: viewportSize.width, height: viewportSize.height }}
        >
          <img
            src={sourceUrl}
            alt=""
            draggable={false}
            onLoad={event => setImageSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })}
            className="pointer-events-none absolute max-w-none select-none"
            style={placement && imageSize ? {
              left: placement.offsetX,
              top: placement.offsetY,
              width: imageSize.width * placement.scale,
              height: imageSize.height * placement.scale,
              // The global responsive-image rule must not clamp only the width.
              // Crop scaling owns both dimensions so the source aspect stays intact.
              maxWidth: 'none',
              maxHeight: 'none',
              transform: imageTransform(placement),
              transformOrigin: '0 0',
            } : { opacity: 0 }}
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} className="border-[0.5px] border-[var(--ff-paper)]/25" />
            ))}
          </div>
        </div>
      </div>

      <footer data-crop-controls className="mx-auto flex w-full max-w-[900px] shrink-0 flex-col gap-2 rounded-[6px] border border-[var(--ff-line)] bg-[var(--ff-panel)] p-2.5 text-[var(--ff-paper)] shadow-[0_12px_32px_rgba(0,0,0,.28)] sm:flex-row sm:flex-wrap sm:items-center" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
        <label className="flex min-h-11 min-w-[180px] flex-1 items-center gap-3 text-xs text-[var(--ff-paper-muted)]">
          <span className="shrink-0">等比放大</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={draft.zoom}
            aria-valuetext={`${Math.round(draft.zoom * 100)}%`}
            onChange={event => {
              const nextZoom = Number(event.target.value);
              setDraft(current => imageSize && viewportSize.width > 0 && viewportSize.height > 0
                ? changeZoomPreservingView(
                    imageSize.width,
                    imageSize.height,
                    viewportSize.width,
                    viewportSize.height,
                    current,
                    nextZoom,
                  )
                : normalizeRenderTransform({ ...current, zoom: nextZoom }));
            }}
            className="h-11 w-full accent-[var(--ff-amber)]"
          />
        </label>
        <div className="flex shrink-0 items-center gap-2">
          <IconButton
            icon={<RotateCwIcon />}
            label="顺时针旋转 90 度"
            title="旋转 90°"
            onClick={() => setDraft(current => normalizeRenderTransform({ ...current, quarterTurns: ((current.quarterTurns + 1) % 4) as 0 | 1 | 2 | 3 }))}
          />
          <IconButton
            icon={<ResetIcon />}
            label="重置位置"
            onClick={() => setDraft(current => normalizeRenderTransform({ ...DEFAULT_POSITION, quarterTurns: current.quarterTurns }))}
            title="重置位置"
          />
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onCancel}>取消</Button>
          <Button variant="primary" onClick={() => onCommit(draft)}>完成</Button>
        </div>
      </footer>
    </section>
  );
}

const DEFAULT_POSITION = { focusX: 0.5, focusY: 0.5, zoom: 1 };
