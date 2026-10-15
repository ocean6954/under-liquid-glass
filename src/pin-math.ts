/* Pure decision helpers for the pinning loop, extracted for testability. */

/* Below this scroll range there is no room to pin: the target is half the
 * range, and it must clearly exceed the position tolerance, or a document
 * sitting at its top edge would be misreported as pinned. */
export const MIN_PINNABLE_RANGE_PX = 4

/* iOS reports fractional scroll positions; do not fight sub-pixel drift. */
export const POSITION_TOLERANCE_PX = 1

/* The pin target comes from the actual scroll range, not the configured
 * runway: when the range is momentarily smaller, a fixed target would get
 * clamped by the browser and read as a failure forever. */
export function computePinTarget(edgeSpacePx: number, maxScrollPx: number): number {
  return Math.min(edgeSpacePx, maxScrollPx / 2)
}

export function isPinnableRange(maxScrollPx: number): boolean {
  return maxScrollPx >= MIN_PINNABLE_RANGE_PX
}

export function isAtTarget(scrollY: number, targetPx: number): boolean {
  return Math.abs(scrollY - targetPx) <= POSITION_TOLERANCE_PX
}
