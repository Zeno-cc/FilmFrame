import type { ReactNode, SVGProps } from 'react';

export interface FilmFrameIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
  title?: string;
  children?: ReactNode;
}

function FilmFrameIcon({ size = 20, title, children, ...props }: FilmFrameIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function ApertureIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><circle cx="12" cy="12" r="8.5" /><path d="m12 3.5 3.2 5.2-1.7 2.3" /><path d="m20.5 12-5.2 3.2-2.3-1.7" /><path d="m12 20.5-3.2-5.2 1.7-2.3" /><path d="M3.5 12 8.7 8.8 11 10.5" /></FilmFrameIcon>;
}

export function AlertIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M10.3 4.3 2.5 18a1.5 1.5 0 0 0 1.3 2.2h16.4a1.5 1.5 0 0 0 1.3-2.2L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 16.6h.01" /></FilmFrameIcon>;
}

export function ArrowDownIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M12 4v16" /><path d="m6 14 6 6 6-6" /></FilmFrameIcon>;
}

export function ArrowLeftIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M20 12H4" /><path d="m10 6-6 6 6 6" /></FilmFrameIcon>;
}

export function ArrowRightIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M4 12h16" /><path d="m14 6 6 6-6 6" /></FilmFrameIcon>;
}

export function ArrowUpIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M12 20V4" /><path d="m6 10 6-6 6 6" /></FilmFrameIcon>;
}

export function CheckCircleIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><circle cx="12" cy="12" r="8.5" /><path d="m8.3 12.1 2.4 2.4 5-5" /></FilmFrameIcon>;
}

export function CheckIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="m5 12.5 4.3 4.3L19 7.2" /></FilmFrameIcon>;
}

export function ChevronDownIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="m6 9 6 6 6-6" /></FilmFrameIcon>;
}

export function ChevronLeftIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="m15 6-6 6 6 6" /></FilmFrameIcon>;
}

export function ChevronRightIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="m9 6 6 6-6 6" /></FilmFrameIcon>;
}

export function ChevronUpIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="m18 15-6-6-6 6" /></FilmFrameIcon>;
}

export function CircleDashedIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props} strokeDasharray="3 3"><circle cx="12" cy="12" r="8.5" /></FilmFrameIcon>;
}

export function CloseIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="m6 6 12 12" /><path d="m18 6-12 12" /></FilmFrameIcon>;
}

export function CropIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M6 3v12a3 3 0 0 0 3 3h12" /><path d="M3 6h12a3 3 0 0 1 3 3v12" /></FilmFrameIcon>;
}

export function DownloadIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 20h16" /></FilmFrameIcon>;
}

export function ErrorIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><circle cx="12" cy="12" r="8.5" /><path d="m9 9 6 6" /><path d="m15 9-6 6" /></FilmFrameIcon>;
}

export function EyeIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M2.8 12s3.3-5 9.2-5 9.2 5 9.2 5-3.3 5-9.2 5-9.2-5-9.2-5Z" /><circle cx="12" cy="12" r="2.3" /></FilmFrameIcon>;
}

export function EyedropperIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="m14.2 4.2 5.6 5.6" /><path d="m5.1 18.9 8.2-8.2 2.8 2.8-8.2 8.2H5.1v-2.8Z" /><path d="m11.4 5.1 7.5 7.5" /><path d="m3.3 20.7 2.5-2.5" /></FilmFrameIcon>;
}

export function FilmIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><rect x="3.5" y="5" width="17" height="14" rx="1.5" /><path d="M7 5v14M17 5v14M3.5 9h17M3.5 15h17" /></FilmFrameIcon>;
}

export function GripIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><circle cx="8" cy="7" r=".8" fill="currentColor" stroke="none" /><circle cx="16" cy="7" r=".8" fill="currentColor" stroke="none" /><circle cx="8" cy="12" r=".8" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r=".8" fill="currentColor" stroke="none" /><circle cx="8" cy="17" r=".8" fill="currentColor" stroke="none" /><circle cx="16" cy="17" r=".8" fill="currentColor" stroke="none" /></FilmFrameIcon>;
}

export function ImageIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><circle cx="8.5" cy="9" r="1.3" /><path d="m4.5 17 4.6-4.6 3.1 3.1 2.2-2.2 5.1 5.1" /></FilmFrameIcon>;
}

export function InfoIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><path d="M12 8h.01" /></FilmFrameIcon>;
}

export function LoaderIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M12 3a9 9 0 1 0 9 9" /></FilmFrameIcon>;
}

export function MoreIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></FilmFrameIcon>;
}

export function PauseIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M8 5v14" /><path d="M16 5v14" /></FilmFrameIcon>;
}

export function PlayIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="m8 5 10 7-10 7V5Z" /></FilmFrameIcon>;
}

export function PlusIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M12 5v14" /><path d="M5 12h14" /></FilmFrameIcon>;
}

export function RefreshIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M20 11a8 8 0 0 0-14.7-4L3 10" /><path d="M3 5v5h5" /><path d="M4 13a8 8 0 0 0 14.7 4L21 14" /><path d="M21 19v-5h-5" /></FilmFrameIcon>;
}

export function RotateCwIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></FilmFrameIcon>;
}

export function RotateIcon(props: FilmFrameIconProps) {
  return <RotateCwIcon {...props} />;
}

export function ResetIcon(props: FilmFrameIconProps) {
  return <RefreshIcon {...props} />;
}

export function ShareIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><circle cx="18" cy="5" r="2.3" /><circle cx="6" cy="12" r="2.3" /><circle cx="18" cy="19" r="2.3" /><path d="m8.1 11 7.8-4.6" /><path d="m8.1 13 7.8 4.6" /></FilmFrameIcon>;
}

export function SettingsIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M12 3.5v2" /><path d="M12 18.5v2" /><path d="m5.99 5.99 1.4 1.4" /><path d="m16.61 16.61 1.4 1.4" /><path d="M3.5 12h2" /><path d="M18.5 12h2" /><path d="m5.99 18.01 1.4-1.4" /><path d="m16.61 7.39 1.4-1.4" /><circle cx="12" cy="12" r="3.5" /></FilmFrameIcon>;
}

export function StopIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><rect x="6.5" y="6.5" width="11" height="11" rx="1" /></FilmFrameIcon>;
}

export function SunIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><circle cx="12" cy="12" r="3.5" /><path d="M12 2.8v2" /><path d="M12 19.2v2" /><path d="m4.9 4.9 1.4 1.4" /><path d="m17.7 17.7 1.4 1.4" /><path d="M2.8 12h2" /><path d="M19.2 12h2" /><path d="m4.9 19.1 1.4-1.4" /><path d="m17.7 6.3 1.4-1.4" /></FilmFrameIcon>;
}

export function HelpIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9a2.3 2.3 0 1 1 3.9 1.6c-1.1 1.1-1.7 1.4-1.7 2.9" /><path d="M12 17h.01" /></FilmFrameIcon>;
}

export function CoffeeIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M4 8h13v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z" /><path d="M17 10h1a3 3 0 0 1 0 6h-1M7 4v2M11 4v2M15 4v2" /></FilmFrameIcon>;
}

export function GitHubIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M9 19c-4.5 1.5-4.5-2.3-6.3-2.9M15 22v-3.7a3.2 3.2 0 0 0-.9-2.4c3-.3 6.1-1.5 6.1-6.7a5.2 5.2 0 0 0-1.4-3.6 4.8 4.8 0 0 0-.1-3.6s-1.1-.4-3.7 1.4a12.7 12.7 0 0 0-6.8 0C5.6 1.6 4.5 2 4.5 2a4.8 4.8 0 0 0-.1 3.6A5.2 5.2 0 0 0 3 9.2c0 5.2 3.1 6.4 6.1 6.7a3.2 3.2 0 0 0-.9 2.4V22" /></FilmFrameIcon>;
}

export function FilmLogoIcon({ size = 32, ...props }: FilmFrameIconProps) {
  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden={props.title ? undefined : true}
      role={props.title ? 'img' : undefined}
    >
      {props.title ? <title>{props.title}</title> : null}
      <rect x="2" y="2" width="28" height="28" rx="5" fill="currentColor" opacity=".95" />
      <rect x="8" y="8" width="16" height="16" rx="1" fill="var(--ff-bg-deep, #0b0a08)" />
      <path d="M4.5 10h2v3h-2zm0 9h2v3h-2zm19-9h2v3h-2zm0 9h2v3h-2z" fill="var(--ff-bg-deep, #0b0a08)" />
    </svg>
  );
}

export function TrashIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M4 7h16" /><path d="M10 11v5" /><path d="M14 11v5" /><path d="m6 7 1 13h10l1-13" /><path d="M9 7V4h6v3" /></FilmFrameIcon>;
}

export function UploadIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M4 14v5h16v-5" /></FilmFrameIcon>;
}

export function WarningIcon(props: FilmFrameIconProps) {
  return <FilmFrameIcon {...props}><path d="M10.3 4.3 2.5 18a1.5 1.5 0 0 0 1.3 2.2h16.4a1.5 1.5 0 0 0 1.3-2.2L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 16.6h.01" /></FilmFrameIcon>;
}

export function XIcon(props: FilmFrameIconProps) {
  return <CloseIcon {...props} />;
}
