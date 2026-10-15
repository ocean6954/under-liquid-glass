import { describe, expect, it } from 'vitest'

import {
  MIN_PINNABLE_RANGE_PX,
  POSITION_TOLERANCE_PX,
  computePinTarget,
  isAtTarget,
  isPinnableRange,
} from '../src/pin-math'

describe('computePinTarget', () => {
  it('pins at the configured runway when the range allows it', () => {
    expect(computePinTarget(160, 320)).toBe(160)
  })

  it('falls back to half the range when the range is smaller than the runway', () => {
    // A fixed 160px target would be clamped by the browser and read as a
    // permanent failure; half the range always stays reachable.
    expect(computePinTarget(160, 100)).toBe(50)
  })

  it('never exceeds half the range even for huge runways', () => {
    expect(computePinTarget(10_000, 320)).toBe(160)
  })
})

describe('isPinnableRange', () => {
  it('rejects ranges whose midpoint would sit inside the position tolerance', () => {
    // Half of MIN_PINNABLE_RANGE_PX must clearly exceed the tolerance,
    // or "sitting at the top edge" would be reported as pinned.
    expect(MIN_PINNABLE_RANGE_PX / 2).toBeGreaterThan(POSITION_TOLERANCE_PX)
    expect(isPinnableRange(MIN_PINNABLE_RANGE_PX - 1)).toBe(false)
    expect(isPinnableRange(MIN_PINNABLE_RANGE_PX)).toBe(true)
  })

  it('rejects zero and negative ranges', () => {
    expect(isPinnableRange(0)).toBe(false)
    expect(isPinnableRange(-10)).toBe(false)
  })
})

describe('isAtTarget', () => {
  it('tolerates sub-pixel drift (iOS reports fractional scroll positions)', () => {
    expect(isAtTarget(160.4, 160)).toBe(true)
    expect(isAtTarget(159.2, 160)).toBe(true)
  })

  it('rejects positions clearly off the target', () => {
    expect(isAtTarget(0, 160)).toBe(false)
    expect(isAtTarget(161.5, 160)).toBe(false)
  })
})
