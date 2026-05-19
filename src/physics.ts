export const RS = 2;
export const HORIZON_EPS = 1.015;

export type ClockMode = "freefall" | "drag" | "pinned" | "paused";

export type GeodesicState = {
  t: number;
  r: number;
  phi: number;
  ut: number;
  ur: number;
  uphi: number;
  tau: number;
};

export type ForcedStepResult = {
  state: GeodesicState;
  rate: number;
  spacelike: boolean;
};

export function schwarzschildFactor(r: number, rs = RS) {
  return 1 - rs / r;
}

export function staticClockRate(r: number, rs = RS) {
  return Math.sqrt(Math.max(0, schwarzschildFactor(r, rs)));
}

export function initialStaticState(r: number, phi = 0, rs = RS): GeodesicState {
  const safeR = Math.max(r, rs * HORIZON_EPS);
  return {
    t: 0,
    r: safeR,
    phi,
    ut: 1 / staticClockRate(safeR, rs),
    ur: 0,
    uphi: 0,
    tau: 0,
  };
}

export function stateWithCoordinateVelocity(
  state: GeodesicState,
  radialVelocity: number,
  tangentialVelocity: number,
  rs = RS,
): GeodesicState {
  const r = Math.max(state.r, rs * HORIZON_EPS);
  const f = schwarzschildFactor(r, rs);
  const maxRadial = f * 0.92;
  const maxTangential = Math.sqrt(f) * 0.92;
  const drdt = clamp(radialVelocity, -maxRadial, maxRadial);
  const tangential = clamp(tangentialVelocity, -maxTangential, maxTangential);
  const dphidt = tangential / r;
  const rateSquared = Math.max(1e-8, f - (drdt * drdt) / f - r * r * dphidt * dphidt);
  const ut = 1 / Math.sqrt(rateSquared);

  return {
    ...state,
    r,
    ut,
    ur: drdt * ut,
    uphi: dphidt * ut,
  };
}

export function norm4Velocity(s: GeodesicState, rs = RS) {
  const f = schwarzschildFactor(s.r, rs);
  return f * s.ut * s.ut - (s.ur * s.ur) / f - s.r * s.r * s.uphi * s.uphi;
}

function derivatives(s: GeodesicState, rs: number): GeodesicState {
  const r = Math.max(s.r, rs * HORIZON_EPS);
  const f = schwarzschildFactor(r, rs);
  const gammaTTr = rs / (2 * r * r * f);
  const gammaRTT = (f * rs) / (2 * r * r);
  const gammaRRR = -rs / (2 * r * r * f);
  const gammaRPP = -f * r;
  const gammaPRP = 1 / r;

  return {
    t: s.ut,
    r: s.ur,
    phi: s.uphi,
    ut: -2 * gammaTTr * s.ut * s.ur,
    ur:
      -gammaRTT * s.ut * s.ut -
      gammaRRR * s.ur * s.ur -
      gammaRPP * s.uphi * s.uphi,
    uphi: -2 * gammaPRP * s.ur * s.uphi,
    tau: 1,
  };
}

function addScaled(a: GeodesicState, b: GeodesicState, scale: number): GeodesicState {
  return {
    t: a.t + b.t * scale,
    r: a.r + b.r * scale,
    phi: a.phi + b.phi * scale,
    ut: a.ut + b.ut * scale,
    ur: a.ur + b.ur * scale,
    uphi: a.uphi + b.uphi * scale,
    tau: a.tau + b.tau * scale,
  };
}

export function rk4TauStep(state: GeodesicState, dTau: number, rs = RS): GeodesicState {
  const k1 = derivatives(state, rs);
  const k2 = derivatives(addScaled(state, k1, dTau / 2), rs);
  const k3 = derivatives(addScaled(state, k2, dTau / 2), rs);
  const k4 = derivatives(addScaled(state, k3, dTau), rs);

  const next = {
    t: state.t + (dTau / 6) * (k1.t + 2 * k2.t + 2 * k3.t + k4.t),
    r: state.r + (dTau / 6) * (k1.r + 2 * k2.r + 2 * k3.r + k4.r),
    phi: state.phi + (dTau / 6) * (k1.phi + 2 * k2.phi + 2 * k3.phi + k4.phi),
    ut: state.ut + (dTau / 6) * (k1.ut + 2 * k2.ut + 2 * k3.ut + k4.ut),
    ur: state.ur + (dTau / 6) * (k1.ur + 2 * k2.ur + 2 * k3.ur + k4.ur),
    uphi: state.uphi + (dTau / 6) * (k1.uphi + 2 * k2.uphi + 2 * k3.uphi + k4.uphi),
    tau: state.tau + dTau,
  };

  if (next.r <= rs * HORIZON_EPS) {
    next.r = rs * HORIZON_EPS;
    next.ur = Math.min(0, next.ur);
  }

  return next;
}

export function stepFreefallForCoordinateTime(
  state: GeodesicState,
  coordinateDt: number,
  rs = RS,
) {
  let current = state;
  let remaining = coordinateDt;
  let stoppedAtHorizon = false;

  for (let i = 0; i < 400 && remaining > 1e-8; i += 1) {
    const dtChunk = Math.min(remaining, 0.018);
    const dTau = dtChunk / Math.max(1e-6, current.ut);
    const beforeT = current.t;
    current = rk4TauStep(current, dTau, rs);
    if (current.r <= rs * HORIZON_EPS + 1e-8) {
      stoppedAtHorizon = true;
      break;
    }
    remaining -= Math.max(0, current.t - beforeT);
  }

  return { state: current, stoppedAtHorizon };
}

export function stepForcedWorldline(
  state: GeodesicState,
  targetR: number,
  targetPhi: number,
  coordinateDt: number,
  rs = RS,
): ForcedStepResult {
  const safeDt = Math.max(coordinateDt, 1e-6);
  const r = Math.max(targetR, rs * HORIZON_EPS);
  const phiDelta = wrapAngle(targetPhi - state.phi);
  const drdt = (r - state.r) / safeDt;
  const dphidt = phiDelta / safeDt;
  const midR = Math.max((state.r + r) / 2, rs * HORIZON_EPS);
  const f = schwarzschildFactor(midR, rs);
  const rateSquared = f - (drdt * drdt) / f - midR * midR * dphidt * dphidt;
  const spacelike = rateSquared < 0;
  const rate = Math.sqrt(Math.max(0, rateSquared));

  return {
    rate,
    spacelike,
    state: {
      t: state.t + coordinateDt,
      r,
      phi: state.phi + phiDelta,
      ut: 1 / Math.max(rate, 1e-6),
      ur: drdt * (1 / Math.max(rate, 1e-6)),
      uphi: dphidt * (1 / Math.max(rate, 1e-6)),
      tau: state.tau + rate * coordinateDt,
    },
  };
}

export function wrapAngle(angle: number) {
  let a = angle;
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
