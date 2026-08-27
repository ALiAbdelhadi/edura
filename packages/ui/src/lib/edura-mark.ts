export const EDURA_MARK_VIEWBOX = 200;

export type MarkPath = {
  d: string;
  filled?: boolean;
  light?: boolean;
};

export const EDURA_MARK_STROKE = { heavy: 10, light: 8 } as const;

export const EDURA_MARK_PATHS: MarkPath[] = [
  {
    d: "M100 68 C87 58.5 70.5 54 51 55.5 C47.5 56 45 58.5 45 62 L45 130 C45 134 48 137 52 136.5 C70 135 86 139 100 148.5",
  },
  {
    d: "M100 68 C113 58.5 129.5 54 149 55.5 C152.5 56 155 58.5 155 62 L155 130 C155 134 152 137 148 136.5 C130 135 114 139 100 148.5",
  },
  { d: "M100 68 L100 148.5", light: true },
];
