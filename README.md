# Schwarzschild Clock Lab

Interactive browser lab for exploring how clocks drift in Schwarzschild spacetime. Add clocks, tune their initial coordinate velocities, switch between free fall and pinned worldlines, and watch proper time diverge near the event horizon.

![Schwarzschild Clock Lab interface](docs/clock-lab-screenshot.png)

## What It Shows

- Gravitational time dilation through the live `dτ/dt` readout.
- Radial and tangential coordinate velocity controls for each clock.
- Free-fall trajectories integrated in Schwarzschild coordinates.
- Pinned clocks that hold position and accumulate proper time at the local static-observer rate.
- Timelike normalization checks with `g(u,u)` for the lead clock.
- Horizon stopping behavior when a free-fall clock reaches the exterior integration boundary.

## Controls

- **Play / Pause** starts or stops the current simulation state.
- **Add clock** creates another clock at a nearby radius.
- **Free fall** prepares every clock with its configured radial and tangential velocities.
- **Pin** toggles clocks between held-at-radius and free-fall behavior.
- **Reset** rebuilds the scene from the selected initial radius.
- **r0** sets the radius used for new clocks and resets.
- **Speed** changes the coordinate-time playback multiplier.

## Physics Model

The simulation uses the Schwarzschild metric with `rs = 2` in geometric units. Motion is restricted to the equatorial plane, so the rendered state is described by `(t, r, phi)` and the corresponding four-velocity components.

$$
\begin{aligned}
ds^2 &= f(r)\,dt^2 - f(r)^{-1}\,dr^2 - r^2\,d\phi^2, \\
f(r) &= 1 - \frac{r_s}{r}.
\end{aligned}
$$

For a static pinned clock, the local proper-time rate is:

$$
\frac{d\tau}{dt} = \sqrt{1 - \frac{r_s}{r}} = \sqrt{f(r)}.
$$

Free-fall clocks are evolved as geodesics. The app stores each clock as:

$$
y =
\left(
t,\ r,\ \phi,\ u^t,\ u^r,\ u^\phi,\ \tau
\right),
\quad
u^t = \frac{dt}{d\tau},\quad
u^r = \frac{dr}{d\tau},\quad
u^\phi = \frac{d\phi}{d\tau}.
$$

The geodesic equation is:

$$
\frac{dx^\mu}{d\tau} = u^\mu,
\qquad
\frac{du^\mu}{d\tau}
= -\Gamma^\mu_{\alpha\beta}u^\alpha u^\beta.
$$

In this reduced Schwarzschild model, the non-zero Christoffel symbols used by the simulation are:

$$
\begin{aligned}
\Gamma^t_{\ tr} &= \frac{r_s}{2r^2 f}, &
\Gamma^r_{\ tt} &= \frac{f r_s}{2r^2}, \\
\Gamma^r_{\ rr} &= -\frac{r_s}{2r^2 f}, &
\Gamma^r_{\ \phi\phi} &= -fr, \\
\Gamma^\phi_{\ r\phi} &= \frac{1}{r}.
\end{aligned}
$$

That gives the first-order system:

$$
\begin{aligned}
\frac{dt}{d\tau} &= u^t, &
\frac{dr}{d\tau} &= u^r, &
\frac{d\phi}{d\tau} &= u^\phi, \\
\frac{du^t}{d\tau} &= -2\Gamma^t_{\ tr}u^t u^r, \\
\frac{du^r}{d\tau} &=
  -\Gamma^r_{\ tt}(u^t)^2
  -\Gamma^r_{\ rr}(u^r)^2
  -\Gamma^r_{\ \phi\phi}(u^\phi)^2, \\
\frac{du^\phi}{d\tau} &= -2\Gamma^\phi_{\ r\phi}u^r u^\phi, \\
\frac{d\tau}{d\tau} &= 1.
\end{aligned}
$$

Each free-fall step uses fourth-order Runge-Kutta over proper time:

$$
\begin{aligned}
k_1 &= F(y_n), \\
k_2 &= F\left(y_n + \frac{\Delta\tau}{2}k_1\right), \\
k_3 &= F\left(y_n + \frac{\Delta\tau}{2}k_2\right), \\
k_4 &= F\left(y_n + \Delta\tau\,k_3\right), \\
y_{n+1} &= y_n + \frac{\Delta\tau}{6}
\left(k_1 + 2k_2 + 2k_3 + k_4\right).
\end{aligned}
$$

The UI sliders set initial coordinate velocities. Before integration, those are converted into four-velocity components by normalizing the timelike interval:

$$
\begin{aligned}
\frac{d\tau}{dt}
&=
\sqrt{
f
- \frac{1}{f}\left(\frac{dr}{dt}\right)^2
- r^2\left(\frac{d\phi}{dt}\right)^2
}, \\
u^t &= \frac{dt}{d\tau}, \\
u^r &= \frac{dr}{dt}\,u^t, \\
u^\phi &= \frac{d\phi}{dt}\,u^t.
\end{aligned}
$$

The app keeps the model intentionally compact: it is designed for intuition and visual experimentation, not high-precision numerical relativity.

## Development

```bash
npm install
npm run dev
```

Useful scripts:

```bash
npm run build
npm test
npm run preview
```

## GitHub About

Suggested repository description:

```txt
Interactive Schwarzschild clock lab for exploring gravitational time dilation, proper time, and free-fall worldlines.
```

Suggested topics:

```txt
general-relativity, schwarzschild, time-dilation, physics-simulation, react, vite, typescript
```
