import type { DragEventHandler, ReactNode } from 'react';

export interface WorkspaceProps {
  toolbar: ReactNode;
  children: ReactNode;
  isDragActive?: boolean;
  dragMessage?: string;
  onDragEnter?: DragEventHandler<HTMLElement>;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDragLeave?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
  className?: string;
}

export function Workspace({
  toolbar,
  children,
  isDragActive = false,
  dragMessage = '松开以加入这一卷',
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  className = '',
}: WorkspaceProps) {
  return (
    <section
      className={`relative min-h-[calc(100dvh-4rem)] bg-[var(--ff-bg)] ${className}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {toolbar}
      <div className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-6">
        {children}
      </div>
      {isDragActive ? (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-[6px] border border-[var(--ff-amber)] bg-[color:var(--ff-bg)]/95" role="status">
          <span className="font-[var(--ff-font-display)] text-xl text-[var(--ff-amber)]">{dragMessage}</span>
        </div>
      ) : null}
    </section>
  );
}

export default Workspace;
