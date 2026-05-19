import { describe, expect, it } from "vitest";
import {
  RS,
  initialStaticState,
  norm4Velocity,
  staticClockRate,
  stepFreefallForCoordinateTime,
} from "./physics";

describe("Schwarzschild clock physics", () => {
  it("makes static clocks closer to the horizon run slower", () => {
    expect(staticClockRate(RS * 1.1)).toBeLessThan(staticClockRate(RS * 3));
    expect(staticClockRate(RS * 20)).toBeGreaterThan(0.97);
  });

  it("initializes a static observer with normalized four-velocity", () => {
    const state = initialStaticState(RS * 5);
    expect(norm4Velocity(state)).toBeCloseTo(1, 8);
  });

  it("keeps radial freefall timelike during short integration", () => {
    const state = initialStaticState(RS * 6);
    const next = stepFreefallForCoordinateTime(state, 0.5).state;
    expect(norm4Velocity(next)).toBeCloseTo(1, 3);
    expect(next.tau).toBeGreaterThan(0);
  });
});
