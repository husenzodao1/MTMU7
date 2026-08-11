export const DURATION = {
  fast: "150ms",
  normal: "250ms",
  slow: "350ms",
  extraSlow: "500ms",
} as const;

export const EASING = {
  default: "cubic-bezier(0.25, 0.1, 0.25, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  out: "cubic-bezier(0, 0, 0.2, 1)",
  in: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

export const Z_INDEX = {
  dropdown: 50,
  sticky: 100,
  overlay: 200,
  modal: 300,
  toast: 400,
  tooltip: 500,
} as const;
