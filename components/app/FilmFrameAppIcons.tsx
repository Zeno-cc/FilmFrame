import type { SVGProps } from 'react';
import type { FilmFrameIconProps } from '../icons/FilmFrameIcons';

// Shared icon primitives live in components/icons. This barrel keeps app-only
// extras local while allowing existing feature imports to stay small.
export type AppIconProps = FilmFrameIconProps;
export {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CropIcon,
  DownloadIcon,
  InfoIcon,
  MoreIcon,
  RefreshIcon,
  SettingsIcon,
  TrashIcon,
  UploadIcon,
} from '../icons/FilmFrameIcons';

function iconProps({ size = 18, ...props }: AppIconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
  };
}

export function ResetIcon(props: AppIconProps) {
  return <svg {...iconProps(props)}><path d="M4 8V4h4" /><path d="M4.8 4.8A8 8 0 1 1 4 12" /></svg>;
}

export function ShareIcon(props: AppIconProps) {
  return <svg {...iconProps(props)}><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" /></svg>;
}

export function CoffeeIcon(props: AppIconProps) {
  return <svg {...iconProps(props)}><path d="M4 8h13v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z" /><path d="M17 10h1a3 3 0 0 1 0 6h-1M7 4v2M11 4v2M15 4v2" /></svg>;
}

export function HelpIcon(props: AppIconProps) {
  return <svg {...iconProps(props)}><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.3 2.3 0 1 1 3.9 1.6c-1.1 1.1-1.7 1.4-1.7 2.9" /><path d="M12 17h.01" /></svg>;
}

export function GitHubIcon(props: AppIconProps) {
  return <svg {...iconProps(props)}><path d="M9 19c-4.5 1.5-4.5-2.3-6.3-2.9M15 22v-3.7a3.2 3.2 0 0 0-.9-2.4c3-.3 6.1-1.5 6.1-6.7a5.2 5.2 0 0 0-1.4-3.6 4.8 4.8 0 0 0-.1-3.6s-1.1-.4-3.7 1.4a12.7 12.7 0 0 0-6.8 0C5.6 1.6 4.5 2 4.5 2a4.8 4.8 0 0 0-.1 3.6A5.2 5.2 0 0 0 3 9.2c0 5.2 3.1 6.4 6.1 6.7a3.2 3.2 0 0 0-.9 2.4V22" /></svg>;
}

export function FilmLogoIcon({ size = 32, ...props }: AppIconProps) {
  return (
    <svg {...iconProps({ ...props, size })} viewBox="0 0 32 32" stroke="none">
      <rect x="2" y="2" width="28" height="28" rx="5" fill="currentColor" opacity=".95" />
      <rect x="8" y="8" width="16" height="16" rx="1" fill="var(--ff-bg-deep)" />
      <path d="M4.5 10h2v3h-2zm0 9h2v3h-2zm19-9h2v3h-2zm0 9h2v3h-2z" fill="var(--ff-bg-deep)" />
    </svg>
  );
}
