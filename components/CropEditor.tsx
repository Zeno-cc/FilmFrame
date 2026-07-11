import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RenderTransform } from '../types';
import {
  changeZoomPreservingView,
  createCoverPlacement,
  getVisibleFrameAspect,
  normalizeRenderTransform,
  type NormalizedRenderTransform,
} from '../services/renderTransform';

type Size = { width: number; height: number };

interface CropEditorProps {
  sourceUrl: string;
  initialTransform?: RenderTransform;
  landscapeFrameAspect?: number;
  onCancel: () => void;
  onCommit: (transform: NormalizedRenderTransform) => void;
}

const RotateIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>;
const ResetIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
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
  const aspectRatio = String(numericAspect);
  const viewportSize = useMemo(() => {
    if (stageSize.width === 0 || stageSize.height === 0) return { width: 0, height: 0 };
    const width = Math.min(stageSize.width - 8, (stageSize.height - 8) * numericAspect);
    return { width: Math.max(0, width), height: Math.max(0, width / numericAspect) };
  }, [numericAspect, stageSize]);
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

  const nudge = (deltaX: number, deltaY: number) => {
    setDraft(current => normalizeRenderTransform({
      ...current,
      focusX: clamp(current.focusX + deltaX),
      focusY: clamp(current.focusY + deltaY),
    }));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!placement) return;
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
    <div data-crop-editor className="flex min-h-0 w-full flex-1 flex-col items-center pt-16 md:pt-14">
      <div className="mb-2 flex w-full max-w-4xl items-center justify-between px-1 text-white">
        <div>
          <h2 className="text-sm font-semibold">调整构图</h2>
        </div>
        <output className="mono text-xs text-white/60" aria-live="polite">{Math.round(draft.zoom * 100)}%</output>
      </div>

      <div ref={stageRef} className="flex min-h-0 w-full flex-1 items-center justify-center px-1">
        <div
          ref={viewportRef}
          role="region"
          tabIndex={0}
          aria-label="裁切预览，拖动照片或使用方向键调整位置"
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
          className="crop-viewport relative shrink-0 cursor-grab touch-none overflow-hidden border border-white/70 bg-[#090909] shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-amber-400 active:cursor-grabbing"
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
              transform: imageTransform(placement),
              transformOrigin: '0 0',
            } : { opacity: 0 }}
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} className="border-[0.5px] border-white/35" />
            ))}
          </div>
        </div>
      </div>

      <div data-preview-controls className="relative z-10 mx-auto mt-3 flex w-full max-w-4xl shrink-0 flex-wrap items-center gap-2 rounded-md border border-white/10 bg-[#151515]/95 p-3 text-white shadow-2xl backdrop-blur" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <label className="flex min-h-11 min-w-[180px] flex-1 items-center gap-3 text-xs text-white/70">
          <span className="shrink-0">缩放</span>
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
            className="h-11 w-full accent-amber-500"
          />
        </label>
        <button
          type="button"
          onClick={() => setDraft(current => normalizeRenderTransform({ ...current, quarterTurns: ((current.quarterTurns + 1) % 4) as 0 | 1 | 2 | 3 }))}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-white/10 bg-white/5 text-gray-200"
          aria-label="顺时针旋转 90 度"
          title="旋转"
        ><RotateIcon /></button>
        <button
          type="button"
          onClick={() => setDraft(current => normalizeRenderTransform({ ...DEFAULT_POSITION, quarterTurns: current.quarterTurns }))}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-white/10 bg-white/5 text-gray-200"
          aria-label="重置构图"
          title="重置构图"
        ><ResetIcon /></button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-md px-4 text-xs text-white/70 hover:bg-white/5">取消</button>
        <button type="button" onClick={() => onCommit(draft)} className="min-h-11 rounded-md bg-amber-500 px-5 text-xs font-bold text-black">完成</button>
      </div>
    </div>
  );
}

const DEFAULT_POSITION = { focusX: 0.5, focusY: 0.5, zoom: 1 };
