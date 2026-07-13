import type { DragEvent } from 'react';
import type { RenderArtifact } from '../../services/renderResult';
import type { ImageWorkflowStatus } from '../../services/workflowState';
import type { ImageItem } from '../../types';
import { PhotoCard } from './PhotoCard';

export interface ContactSheetItem {
  item: ImageItem;
  index: number;
  frameNumber: number;
  status: ImageWorkflowStatus;
  artifact: RenderArtifact | null;
  active?: boolean;
  dropTarget?: boolean;
}

export interface ContactSheetProps {
  items: readonly ContactSheetItem[];
  removalAllowed: boolean;
  actionsDisabled?: boolean;
  reorderDisabled?: boolean;
  selectionDisabled?: boolean;
  draggable?: boolean;
  onOpen: (id: string) => void;
  onRetry: (id: string) => void;
  onToggleIncluded: (id: string) => void;
  onDownload: (artifact: RenderArtifact, filename: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onDragStart?: (event: DragEvent<HTMLElement>, index: number) => void;
  onDragEnter?: (event: DragEvent<HTMLElement>, index: number) => void;
  onDragOver?: (event: DragEvent<HTMLElement>, index: number) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>, index: number) => void;
  className?: string;
}

export function ContactSheet({
  items,
  removalAllowed,
  actionsDisabled = false,
  reorderDisabled = false,
  selectionDisabled = false,
  draggable = false,
  onOpen,
  onRetry,
  onToggleIncluded,
  onDownload,
  onRemove,
  onMove,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDragEnd,
  className = '',
}: ContactSheetProps) {
  return (
    <ol
      className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5 2xl:grid-cols-4 ${className}`}
      aria-label={`接触印象，共 ${items.length} 张照片`}
    >
      {items.map(view => (
        <li key={view.item.id} className="min-w-0">
          <PhotoCard
            {...view}
            total={items.length}
            removalAllowed={removalAllowed}
            actionsDisabled={actionsDisabled}
            reorderDisabled={reorderDisabled}
            selectionDisabled={selectionDisabled}
            draggable={draggable}
            onOpen={onOpen}
            onRetry={onRetry}
            onToggleIncluded={onToggleIncluded}
            onDownload={onDownload}
            onRemove={onRemove}
            onMove={onMove}
            onDragStart={onDragStart}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
          />
        </li>
      ))}
    </ol>
  );
}

export default ContactSheet;
