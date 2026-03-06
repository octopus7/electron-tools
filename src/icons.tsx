import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function AppGlyph(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 6.5h16v11H4z" />
      <path d="M4 10.5h16" />
      <path d="M8 14h3" />
      <path d="M13 14h3" />
      <path d="M8 17h8" />
    </BaseIcon>
  );
}

export function MinimizeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 12.5h14" />
    </BaseIcon>
  );
}

export function MaximizeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />
    </BaseIcon>
  );
}

export function RestoreIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 8.5V6.5h10v10h-2" />
      <rect x="6" y="8" width="10" height="10" rx="1.5" />
    </BaseIcon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 7l10 10" />
      <path d="M17 7L7 17" />
    </BaseIcon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 10l5 5 5-5" />
    </BaseIcon>
  );
}

export function ZoomIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="10" cy="10" r="5.5" />
      <path d="M14.5 14.5L19 19" />
      <path d="M10 7.5v5" />
      <path d="M7.5 10h5" />
    </BaseIcon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4.5 19.5l4.2-1.1L18 9.1 14.9 6 5.6 15.3 4.5 19.5z" />
      <path d="M13.8 7.1l3.1 3.1" />
    </BaseIcon>
  );
}

export function BrushIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M15 4.5c2.2 2.2 3 5 .8 7.2l-3.3 3.3a4.5 4.5 0 01-6.4 0" />
      <path d="M6.1 15.2c-2.6.3-4.1 1.7-4.1 3.8h5.2" />
      <path d="M15 4.5l4.5 4.5" />
    </BaseIcon>
  );
}

export function EraserIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 6.5l8.7 8.7a2.2 2.2 0 010 3.1l-.8.8H8.4l-3.9-3.9a2.2 2.2 0 010-3.1L9.8 6.5a2.2 2.2 0 013.1 0z" />
      <path d="M13.2 19.1l3-3" />
    </BaseIcon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 10v5" />
      <path d="M12 7.5h.01" />
    </BaseIcon>
  );
}
