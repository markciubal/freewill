import { useId, type ComponentProps } from "react";

// The Grace mark: an upright olive sprig, drawn to sit at text height like a
// currency sign. Filled leaves on a stem; two outlined olives sit over them,
// with a small gap knocked out of whatever is behind so the rings read as on
// top on any background. Inherits the text color and size (1em).
//   <GraceMark /> 20        reads "20 Grace"

export const GRACE_PATHS = {
  stem: "M12 22 C 11.6 16.5, 12.4 9, 12 2.6",
  leaves: [
    "M12 16.6 C 8.4 16.6, 5.9 14, 6.2 10.6 C 9.7 10.9, 12.1 13.3, 12 16.6 Z",
    "M12 12.4 C 15.6 12.4, 18.1 9.8, 17.8 6.4 C 14.3 6.7, 11.9 9.1, 12 12.4 Z",
    "M12 8.4 C 9.1 8.4, 7.1 6.2, 7.5 3.4 C 10.3 3.7, 12.2 5.8, 12 8.4 Z",
  ],
  olives: [
    { cx: 9.4, cy: 19.3, r: 2.3 },
    { cx: 13.4, cy: 12.5, r: 1.9 },
  ],
  gap: 1,
};

export function GraceMark({ size = "1em", title = "Grace", className = "", ...props }: { size?: string | number; title?: string } & Omit<ComponentProps<"svg">, "children">) {
  const maskId = `grace-mask-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { stem, leaves, olives, gap } = GRACE_PATHS;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={`inline-block align-[-0.15em] ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <title>{title}</title>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="white" stroke="none" />
          {olives.map((o, i) => <circle key={i} cx={o.cx} cy={o.cy} r={o.r + gap} fill="black" stroke="none" />)}
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <path d={stem} />
        {leaves.map((d, i) => <path key={i} d={d} fill="currentColor" stroke="none" />)}
      </g>
      {olives.map((o, i) => <circle key={i} cx={o.cx} cy={o.cy} r={o.r} />)}
    </svg>
  );
}
