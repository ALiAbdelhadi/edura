export type LogicalDirection = "start" | "end";

export function directionFactor(isRtl: boolean): 1 | -1 {
  return isRtl ? -1 : 1;
}

export function logicalX(
  distance: number,
  from: LogicalDirection,
  isRtl: boolean,
): number {
  const towardStart = from === "start" ? -1 : 1;
  return distance * towardStart * directionFactor(isRtl) || 0;
}

export function logicalXPercent(
  percent: number,
  from: LogicalDirection,
  isRtl: boolean,
): number {
  return logicalX(percent, from, isRtl);
}

export const PHYSICAL = <T>(value: T): T => value;

export function filmstripTravel(
  trackWidth: number,
  viewportWidth: number,
  isRtl: boolean,
): number {
  const distance = Math.max(0, trackWidth - viewportWidth);
  return logicalX(distance, "start", isRtl);
}
