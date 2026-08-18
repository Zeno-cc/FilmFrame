import type { ReactNode } from 'react';

export interface AppShellProps {
  header: ReactNode;
  workspace: ReactNode;
  inspector?: ReactNode;
  mobileActionBar?: ReactNode;
  overlays?: ReactNode;
  className?: string;
}

export function AppShell({
  header,
  workspace,
  inspector,
  mobileActionBar,
  overlays,
  className = '',
}: AppShellProps) {
  return (
    <div className={`ff-app-shell min-h-dvh bg-[var(--ff-bg-deep)] text-[var(--ff-paper)] ${className}`} data-atmosphere="on">
      {header}
      <div className="ff-app-body mx-auto grid w-full max-w-[1900px] grid-cols-1 min-[1180px]:grid-cols-[minmax(0,1fr)_344px] min-[1536px]:grid-cols-[minmax(0,1fr)_368px]">
        <main
          id="workspace"
          tabIndex={-1}
          className="min-w-0 scroll-mt-14 pb-24 focus:outline-none md:scroll-mt-16 min-[768px]:pb-8"
        >
          {workspace}
        </main>
        {inspector}
      </div>
      {mobileActionBar}
      {overlays}
    </div>
  );
}

export default AppShell;
