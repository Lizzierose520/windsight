import type { CSSProperties } from "react";

export type IconName =
  | "arrow"
  | "arrow-up"
  | "chevron"
  | "check"
  | "close"
  | "menu"
  | "train"
  | "ship"
  | "truck"
  | "file"
  | "layers"
  | "shield"
  | "globe"
  | "spark"
  | "clock"
  | "alert"
  | "link"
  | "download"
  | "search"
  | "plus"
  | "send";
const paths: Record<IconName, React.ReactNode> = {
  arrow: (
    <>
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </>
  ),
  "arrow-up": (
    <>
      <path d="M6 18 18 6M6 6h12v12" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  train: (
    <>
      <rect x="5" y="3" width="14" height="15" rx="4" />
      <path d="M5 10h14M12 3v7m-5 11 2-3m6 0 2 3M8 14h1m6 0h1" />
    </>
  ),
  ship: (
    <>
      <path d="M4 12 12 9l8 3-3 7H7l-3-7ZM8 10V5h8v5M12 5V2M2 21l3-1 4 1 3-1 4 1 4-1 2 1" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6h11v12H3V6Zm11 5h4l3 4v3h-7" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h5" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="m12 3 10 18H2L12 3Z" />
      <path d="M12 9v5m0 3h.01" />
    </>
  ),
  link: (
    <>
      <path d="m10 7 2-2a5 5 0 0 1 7 7l-2 2m-3 3-2 2a5 5 0 0 1-7-7l2-2m1 6 8-8" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
  plus: <path d="M5 12h14M12 5v14" />,
  send: (
    <>
      <path d="m3 3 18 9-18 9 4-9-4-9Zm4 9h14" />
    </>
  ),
};
export function Icon({
  name,
  size = 20,
  className = "",
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
export function Brand({
  light = false,
  compact = false,
}: {
  light?: boolean;
  compact?: boolean;
}) {
  return (
    <span className={`brand ${light ? "brand-light" : ""}`}>
      <svg
        className="brand-symbol"
        width="34"
        height="34"
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 11.5h20c8 0 8-8 1.5-8"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path
          d="M8 18h21M4 24.5h17c8 0 8 8 1.5 8"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      </svg>
      {!compact && (
        <>
          <span className="brand-cn">观风</span>
          <span className="brand-en">WindSight</span>
        </>
      )}
    </span>
  );
}
