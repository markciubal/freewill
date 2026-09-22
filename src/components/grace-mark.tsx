import { useId, type ComponentProps } from "react";

// The Grace mark: an upright olive sprig, drawn to sit at text height like a
// currency sign. Filled leaves on a stem; two outlined olives sit over them,
// with a small gap knocked out of whatever is behind so the rings read as on
// top on any background. Inherits the text color and size (1em tall).
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

// The drawing fills x 5.9 to 18.1 and y 1.7 to 22.9 of its 24-unit square,
// so the box is cropped to x 5 to 19: no empty margin beside the sprig to
// read as a space before the number. Its middle sits 0.4875 of its height up
// from its bottom, and it is lifted so that middle meets the middle of the
// digits beside it (this font's digits are 0.73em tall), at any size.
const DIGIT_MIDDLE = "0.365em";

export function GraceMark({ size = "1em", title = "Grace", className = "", style, ...props }: { size?: string | number; title?: string } & Omit<ComponentProps<"svg">, "children">) {
  const maskId = `grace-mask-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { stem, leaves, olives, gap } = GRACE_PATHS;
  const height = typeof size === "number" ? `${size}px` : size;
  return (
    <svg
      viewBox="5 0 14 24"
      role="img"
      aria-label={title}
      style={{ width: `calc(${height} * 14 / 24)`, height, verticalAlign: `calc(${DIGIT_MIDDLE} - ${height} * 0.4875)`, ...style }}
      className={`inline-block ${className}`}
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
