import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleDot,
  Crosshair,
  Grip,
  Pause,
  Pin,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import {
  ClockMode,
  GeodesicState,
  RS,
  initialStaticState,
  norm4Velocity,
  stateWithCoordinateVelocity,
  staticClockRate,
  stepForcedWorldline,
  stepFreefallForCoordinateTime,
} from "./physics";

type TrailPoint = { x: number; y: number; tau: number };

type ClockBody = {
  id: number;
  name: string;
  color: string;
  state: GeodesicState;
  mode: ClockMode;
  radialVelocity: number;
  tangentialVelocity: number;
  trail: TrailPoint[];
  spacelike: boolean;
  horizonStop: boolean;
};

const WORLD_RADIUS = 30;
const INITIAL_R = 11;
const OBSERVATION_TIME_SCALE = 10;
const COLORS = ["#12a083", "#2e7dd7", "#d89b1d", "#d94f70", "#7256d9", "#5e7c2b"];

function polarToWorld(r: number, phi: number) {
  return { x: r * Math.cos(phi), y: r * Math.sin(phi) };
}

function formatTime(value: number) {
  return value.toFixed(value < 10 ? 3 : 2);
}

function makeClock(id: number, r: number, phi: number): ClockBody {
  const state = initialStaticState(r, phi);
  return {
    id,
    name: `Clock ${id}`,
    color: COLORS[(id - 1) % COLORS.length],
    state,
    mode: "paused",
    radialVelocity: 0,
    tangentialVelocity: 0,
    trail: [{ ...polarToWorld(state.r, state.phi), tau: state.tau }],
    spacelike: false,
    horizonStop: false,
  };
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const clocksRef = useRef<ClockBody[]>([makeClock(1, INITIAL_R, -0.25)]);
  const [clocks, setClocks] = useState(() => clocksRef.current);
  const [running, setRunning] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [initialRadius, setInitialRadius] = useState(INITIAL_R);

  const view = useMemo(
    () => ({
      worldRadius: WORLD_RADIUS,
      rs: RS,
    }),
    [],
  );

  const syncClocks = useCallback((next: ClockBody[]) => {
    clocksRef.current = next;
    setClocks(next);
  }, []);

  const updateClock = useCallback(
    (id: number, updater: (clock: ClockBody) => ClockBody) => {
      syncClocks(clocksRef.current.map((clock) => (clock.id === id ? updater(clock) : clock)));
    },
    [syncClocks],
  );

  const reset = useCallback(() => {
    const resetClocks = clocksRef.current.map((clock, index) => {
      const phi = -0.25 + index * 0.72;
      return makeClock(clock.id, initialRadius + index * 0.8, phi);
    });
    syncClocks(resetClocks);
    setRunning(false);
  }, [initialRadius, syncClocks]);

  const addClock = useCallback(() => {
    const nextId = Math.max(0, ...clocksRef.current.map((clock) => clock.id)) + 1;
    const phi = -0.25 + (nextId - 1) * 0.78;
    const r = Math.min(WORLD_RADIUS * 0.82, initialRadius + (nextId - 1) * 1.1);
    const coordinateTime = clocksRef.current[0]?.state.t ?? 0;
    const baseClock = makeClock(nextId, r, phi);
    const syncedClock = {
      ...baseClock,
      state: {
        ...baseClock.state,
        t: coordinateTime,
        tau: coordinateTime,
      },
      trail: [{ ...polarToWorld(baseClock.state.r, baseClock.state.phi), tau: coordinateTime }],
    };
    const nextClock = running
      ? {
          ...syncedClock,
          mode: "freefall" as ClockMode,
          state: stateWithCoordinateVelocity(
            syncedClock.state,
            syncedClock.radialVelocity,
            syncedClock.tangentialVelocity,
          ),
        }
      : syncedClock;
    syncClocks([...clocksRef.current, nextClock]);
  }, [initialRadius, running, syncClocks]);

  const startFreefall = useCallback(() => {
    syncClocks(clocksRef.current.map((clock) => ({
      ...clock,
      mode: "freefall",
      horizonStop: false,
      spacelike: false,
      state: stateWithCoordinateVelocity(
        clock.state,
        clock.radialVelocity,
        clock.tangentialVelocity,
      ),
    })));
    setRunning(true);
  }, [syncClocks]);

  const togglePinned = useCallback(() => {
    const shouldPin = clocksRef.current.some((clock) => clock.mode !== "pinned");
    syncClocks(clocksRef.current.map((clock) => ({
      ...clock,
      mode: shouldPin ? "pinned" : "freefall",
      horizonStop: false,
      spacelike: false,
      state: shouldPin
        ? clock.state
        : stateWithCoordinateVelocity(
            clock.state,
            clock.radialVelocity,
            clock.tangentialVelocity,
          ),
    })));
    setRunning(true);
  }, [syncClocks]);

  const toggleRunning = useCallback(() => {
    if (running) {
      setRunning(false);
      return;
    }

    const preparedClocks = clocksRef.current.map((clock) => ({
      ...clock,
      mode: (clock.mode === "pinned" ? "pinned" : "freefall") as ClockMode,
      horizonStop: false,
      spacelike: false,
      state:
        clock.mode === "pinned"
          ? clock.state
          : stateWithCoordinateVelocity(
              clock.state,
              clock.radialVelocity,
              clock.tangentialVelocity,
            ),
    }));
    syncClocks(preparedClocks);
    setRunning(true);
  }, [running, syncClocks]);

  const setClockVelocity = useCallback(
    (id: number, key: "radialVelocity" | "tangentialVelocity", value: number) => {
      updateClock(id, (clock) => {
        const next = { ...clock, [key]: value };
        return {
          ...next,
          state: stateWithCoordinateVelocity(
            next.state,
            next.radialVelocity,
            next.tangentialVelocity,
          ),
        };
      });
    },
    [updateClock],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = parent.getBoundingClientRect();
    const size = Math.max(320, Math.floor(Math.min(rect.width, rect.height || rect.width)));
    if (canvas.width !== Math.floor(size * dpr) || canvas.height !== Math.floor(size * dpr)) {
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const center = size / 2;
    const scale = size / (view.worldRadius * 2);
    const toScreen = (x: number, y: number) => ({
      x: center + x * scale,
      y: center + y * scale,
    });

    const gradient = ctx.createRadialGradient(center, center, 0, center, center, size * 0.54);
    gradient.addColorStop(0, "#111418");
    gradient.addColorStop(0.45, "#18242a");
    gradient.addColorStop(1, "#eef3ee");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.13)";
    ctx.lineWidth = 1;
    for (const r of [RS, 5, 10, 15, 20, 25]) {
      ctx.beginPath();
      ctx.arc(center, center, r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    const horizonRadius = RS * scale;
    ctx.beginPath();
    ctx.arc(center, center, horizonRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#050505";
    ctx.fill();
    ctx.strokeStyle = "#ffad5c";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center, center, horizonRadius * 1.8, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 173, 92, 0.22)";
    ctx.lineWidth = 10;
    ctx.stroke();

    clocks.forEach((clock) => {
      if (clock.trail.length > 1) {
        ctx.beginPath();
        clock.trail.forEach((point, index) => {
          const screen = toScreen(point.x, point.y);
          if (index === 0) ctx.moveTo(screen.x, screen.y);
          else ctx.lineTo(screen.x, screen.y);
        });
        ctx.strokeStyle = `${clock.color}bb`;
        ctx.lineWidth = 2.8;
        ctx.stroke();
      }
    });

    clocks.forEach((clock) => {
      const pos = polarToWorld(clock.state.r, clock.state.phi);
      const screen = toScreen(pos.x, pos.y);
      const clockRadius = Math.max(21, size * 0.04);

      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, clockRadius, 0, Math.PI * 2);
      ctx.fillStyle = clock.mode === "pinned" ? "#fff3c4" : "#f7fff9";
      ctx.fill();
      ctx.strokeStyle = clock.color;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = "#172026";
      ctx.font = `700 ${Math.max(10, clockRadius * 0.38)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(formatTime(clock.state.tau), screen.x, screen.y);

      ctx.fillStyle = clock.color;
      ctx.font = "700 11px ui-sans-serif, system-ui";
      ctx.fillText(String(clock.id), screen.x, screen.y - clockRadius - 9);
    });

    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.textAlign = "left";
    ctx.fillText("rs", center + horizonRadius + 7, center - 7);
  }, [clocks, view.worldRadius]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    function step(frameTime: number) {
      const previous = lastFrameRef.current ?? frameTime;
      lastFrameRef.current = frameTime;
      const realDt = Math.min(0.05, (frameTime - previous) / 1000);
      const coordinateDt = realDt * timeScale * OBSERVATION_TIME_SCALE;

      if (running && coordinateDt > 0) {
        let anyMoving = false;
        const nextClocks = clocksRef.current.map((clock) => {
          let next = clock.state;
          let spacelike = false;
          let horizonStop = clock.horizonStop;
          let mode = clock.mode;

          if (mode === "freefall") {
            const result = stepFreefallForCoordinateTime(next, coordinateDt);
            next = result.state;
            horizonStop = result.stoppedAtHorizon;
            if (result.stoppedAtHorizon) mode = "paused";
            anyMoving = anyMoving || !result.stoppedAtHorizon;
          } else if (mode === "pinned") {
            const result = stepForcedWorldline(next, next.r, next.phi, coordinateDt);
            next = result.state;
            spacelike = result.spacelike;
            anyMoving = true;
          }

          const position = polarToWorld(next.r, next.phi);
          const last = clock.trail.at(-1);
          const trail =
            last && Math.hypot(last.x - position.x, last.y - position.y) < 0.035
              ? clock.trail
              : [...clock.trail.slice(-360), { ...position, tau: next.tau }];

          return { ...clock, state: next, mode, spacelike, horizonStop, trail };
        });

        syncClocks(nextClocks);
        if (!anyMoving && nextClocks.every((clock) => clock.mode === "paused")) {
          setRunning(false);
        }
      }

      animationRef.current = window.requestAnimationFrame(step);
    }

    animationRef.current = window.requestAnimationFrame(step);
    return () => {
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      lastFrameRef.current = null;
    };
  }, [running, syncClocks, timeScale]);

  const leadClock = clocks[0];
  const meanRate =
    clocks.length === 0
      ? 0
      : clocks.reduce((sum, clock) => {
          const rate =
            clock.mode === "pinned"
              ? staticClockRate(clock.state.r)
              : Math.max(0, 1 / Math.max(clock.state.ut, 1e-6));
          return sum + rate;
        }, 0) / clocks.length;
  const coordinateTime = leadClock?.state.t ?? 0;
  const norm = leadClock ? norm4Velocity(leadClock.state) : 0;
  const warningClock = clocks.find((clock) => clock.spacelike || clock.horizonStop);

  return (
    <main className="app-shell">
      <section className="simulation">
        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            aria-label="Schwarzschild clock simulation"
          />
        </div>
        <div className="status-strip">
          <div>
            <span>Clocks</span>
            <strong>{clocks.length}</strong>
          </div>
          <div>
            <span>Avg dτ/dt</span>
            <strong>{meanRate.toFixed(4)}</strong>
          </div>
          <div>
            <span>t∞</span>
            <strong>{formatTime(coordinateTime)}</strong>
          </div>
        </div>
        <div className="clock-dock" aria-label="Clock velocity controls">
          {clocks.map((clock) => (
            <article
              className="clock-card"
              key={clock.id}
              style={{ "--clock-color": clock.color } as React.CSSProperties}
            >
              <header>
                <span className="clock-swatch" />
                <strong>{clock.name}</strong>
                <small>
                  {coordinateTime > 0
                    ? `${Math.max(0, ((coordinateTime - clock.state.tau) / coordinateTime) * 100).toFixed(2)}% lag`
                    : clock.mode === "paused"
                      ? "idle"
                      : clock.mode}
                </small>
              </header>
              <label>
                <span>vᵣ</span>
                <input
                  type="range"
                  min={-0.65}
                  max={0.65}
                  step={0.01}
                  value={clock.radialVelocity}
                  onChange={(event) =>
                    setClockVelocity(clock.id, "radialVelocity", Number(event.target.value))
                  }
                />
                <output>{clock.radialVelocity.toFixed(2)}</output>
              </label>
              <label>
                <span>vφ</span>
                <input
                  type="range"
                  min={-0.65}
                  max={0.65}
                  step={0.01}
                  value={clock.tangentialVelocity}
                  onChange={(event) =>
                    setClockVelocity(clock.id, "tangentialVelocity", Number(event.target.value))
                  }
                />
                <output>{clock.tangentialVelocity.toFixed(2)}</output>
              </label>
            </article>
          ))}
        </div>
      </section>

      <aside className="control-panel">
        <header>
          <h1>Clock Lab</h1>
        </header>

        <div className="toolbar" aria-label="Simulation controls">
          <button
            type="button"
            className="icon-button primary"
            onClick={toggleRunning}
            aria-label={running ? "Pause" : "Play"}
            title={running ? "Pause" : "Play"}
          >
            {running ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button type="button" className="icon-button" onClick={addClock} aria-label="Add clock" title="Add clock">
            <Plus size={20} />
          </button>
          <button type="button" className="icon-button" onClick={startFreefall} aria-label="Free fall" title="Free fall">
            <SkipForward size={20} />
          </button>
          <button type="button" className="icon-button" onClick={togglePinned} aria-label="Pin" title="Pin">
            <Pin size={20} fill={clocks.every((clock) => clock.mode === "pinned") ? "currentColor" : "none"} />
          </button>
          <button type="button" className="icon-button" onClick={reset} aria-label="Reset" title="Reset">
            <RotateCcw size={20} />
          </button>
        </div>

        <div className="mode-readout">
          <span className={`mode-dot ${running ? "freefall" : "paused"}`} />
          <strong>
            {running ? "Running" : "Stopped"}
          </strong>
        </div>

        <label className="control">
          <span>r₀</span>
          <input
            type="range"
            min={RS * 1.4}
            max={17}
            step={0.1}
            value={initialRadius}
            onChange={(event) => setInitialRadius(Number(event.target.value))}
          />
          <output>{(initialRadius / RS).toFixed(2)} rs</output>
        </label>

        <label className="control">
          <span>Speed</span>
          <input
            type="range"
            min={0.2}
            max={5}
            step={0.1}
            value={timeScale}
            onChange={(event) => setTimeScale(Number(event.target.value))}
          />
          <output>{timeScale.toFixed(1)}x</output>
        </label>

        <div className="metrics">
          <div>
            <CircleDot size={17} />
            <span>r₁</span>
            <strong>{leadClock ? leadClock.state.r.toFixed(3) : "n/a"}</strong>
          </div>
          <div>
            <Crosshair size={17} />
            <span>g(u,u)</span>
            <strong>{Number.isFinite(norm) ? norm.toFixed(4) : "n/a"}</strong>
          </div>
          <div>
            <Grip size={17} />
            <span>N</span>
            <strong>{clocks.length}</strong>
          </div>
        </div>

        {warningClock && (
          <div className="warning" role="status">
            {warningClock.spacelike &&
              `${warningClock.name}: spacelike path`}
            {warningClock.horizonStop &&
              `${warningClock.name}: horizon stop`}
          </div>
        )}
      </aside>
    </main>
  );
}

export default App;
