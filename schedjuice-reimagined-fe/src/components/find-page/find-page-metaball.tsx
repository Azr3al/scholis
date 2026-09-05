"use client";

import { useEffect, useRef } from "react";
import { FIND_PAGE_METABALL } from "@/lib/sj/motion";
import { NOTCH_HEIGHT, NOTCH_WIDTH } from "./find-page-island";

/** Vertical distance from the panel edge to the dialog's top. */
export const METABALL_DROP = 48;

/** Canvas bleed around the animated region (droplet scatter, bloom overshoot). */
export const METABALL_PAD = 40;

/** Bead radius at full size. */
const BEAD_R = 28;
/** Dialog corner radius (rounded-3xl). */
const DIALOG_R = 24;
/** Goo blend radius (px) — how far apart shapes start merging. */
const GOO_K = 14;
const MAX_BALLS = 16;
const SATELLITES = 4;
/** Collapsed (Spotlight-style) search bar: input row + island padding. */
const FALLBACK_DIALOG_H = 72;
/** Notch bottom-corner radius — must match the DOM notch's rounded-b-[20px]. */
const NOTCH_R = 20;

// Ball slot layout (open and close reuse what they need; unused slots stay 0).
const S_NECK = 0;
const S_BEAD = 1;
const S_BELLY = 2;
const S_SAT = 3; // ..6
const S_FRONT = 7; // ..8
const S_DRIP = 9; // ..11
const S_LOBE = 12; // ..15

let webglSupport: boolean | null = null;

/** One-time cached probe; used to fall back to the instant-open path. */
export function canUseWebGL(): boolean {
  if (typeof window === "undefined") return false;
  if (webglSupport !== null) return webglSupport;
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl");
    webglSupport = Boolean(gl);
    if (gl) gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

const VERT_SRC = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// The liquid is a signed-distance field: the notch rect, the bloom rect and up
// to MAX_BALLS circles merged with a polynomial smooth-min, thresholded with a
// ~1.5px anti-aliased edge. SDF gradients are ~1, so a constant ramp is a good
// AA without needing the derivatives extension. Output is premultiplied.
const FRAG_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_size;
uniform float u_dpr;
uniform vec4 u_notch;
uniform float u_notchR;
uniform vec4 u_bloom;
uniform float u_bloomR;
uniform vec4 u_balls[${MAX_BALLS}];
uniform vec3 u_ink;
uniform float u_alpha;

float sdRoundRect(vec2 p, vec4 rect, float r) {
  vec2 q = abs(p - rect.xy - rect.zw * 0.5) - rect.zw * 0.5 + vec2(r);
  return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
// Notch silhouette: square top corners (flush with the panel edge), rounded
// bottom corners — matches the DOM notch's rounded-t-none rounded-b-[20px].
float sdNotchRect(vec2 p, vec4 rect, float rBottom) {
  vec2 c = rect.xy + rect.zw * 0.5;
  float r = p.y > c.y ? rBottom : 0.0;
  vec2 q = abs(p - c) - rect.zw * 0.5 + vec2(r);
  return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
float smin(float a, float b) {
  float h = clamp(0.5 + 0.5 * (b - a) / ${GOO_K.toFixed(1)}, 0.0, 1.0);
  return mix(b, a, h) - ${GOO_K.toFixed(1)} * h * (1.0 - h);
}
void main() {
  vec2 p = gl_FragCoord.xy / u_dpr;
  p.y = u_size.y - p.y;
  float d = 1e5;
  if (u_notch.w > 0.0) d = sdNotchRect(p, u_notch, u_notchR);
  if (u_bloom.z > 0.0) d = smin(d, sdRoundRect(p, u_bloom, u_bloomR));
  for (int i = 0; i < ${MAX_BALLS}; i++) {
    vec4 b = u_balls[i];
    if (b.z > 0.0) {
      vec2 q = p - b.xy;
      q.y /= b.w;
      d = smin(d, length(q) - b.z);
    }
  }
  float m = smoothstep(0.75, -0.75, d);
  float a = m * u_alpha;
  gl_FragColor = vec4(u_ink * a, a);
}
`;

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const sm0 = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const backOut = (x: number, s: number) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const k = x - 1;
  return 1 + (s + 1) * k * k * k + s * k * k;
};

/** Resolve any CSS color string to normalized rgb via a 1×1 2D canvas. */
function parseColor(css: string): [number, number, number] {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d");
  if (!ctx) return [0.063, 0.173, 0.141]; // --terminal
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

type Geometry = {
  cx: number;
  notchBottom: number;
  dropCy: number;
  bloomW: number;
  bloomH: number;
  bloomCy: number;
  seed: number;
  sats: { ox: number; vx: number; vy: number; r: number }[];
};

type Frame = {
  balls: Float32Array; // MAX_BALLS × (x, y, r, yStretch); r <= 0 disables
  notch: [number, number, number, number]; // x, y, w, h; h <= 0 disables
  notchR: number;
  bloom: [number, number, number, number]; // x, y, w, h; w <= 0 disables
  bloomR: number;
  alpha: number;
};

/** Fraction of the open timeline where the bead starts blooming into the dialog. */
const BLOOM_AT = 0.55;

function frameOpen(t: number, g: Geometry, out: Frame) {
  const wob = Math.sin(t * 22 + g.seed);
  out.balls.fill(0);
  out.bloom[2] = 0;
  out.alpha = 1;

  // The notch's own liquid story: it fattens into a goo blob, its mass drains
  // into the forming bead, and once the bead snaps off the leftovers flatten
  // and melt up into the panel edge.
  const blob = sm0(seg(t, 0, 0.18));
  const drain = sm0(seg(t, 0.1, 0.42));
  const melt = sm0(seg(t, 0.44, 0.66));
  const notchW = lerp(
    lerp(NOTCH_WIDTH, NOTCH_WIDTH * 0.72, drain),
    NOTCH_WIDTH * 1.3,
    melt,
  );
  const notchH = lerp(NOTCH_HEIGHT + blob * 8 - drain * 6, 0, melt);
  if (notchH > 0.5) {
    out.notch = [g.cx - notchW / 2, METABALL_PAD, notchW, notchH];
    out.notchR = Math.min(lerp(NOTCH_R, 26, blob), notchH / 2);
  } else {
    out.notch = [0, 0, 0, 0];
    out.notchR = 0;
  }
  const nb = METABALL_PAD + notchH;

  // Belly: a flat bulge on the underside that the bead visibly pulls out of.
  const sag = sm0(seg(t, 0.02, 0.26)) * (1 - sm0(seg(t, 0.3, 0.44)));
  const bellyR = sag * 13;
  if (bellyR > 0.5) {
    out.balls.set([g.cx + wob * 0.6, nb - 2, bellyR, 0.6], S_BELLY * 4);
  }

  // Satellite droplets scatter as the bead snaps off (they outlive the fall,
  // so they're drawn outside the fall/bloom branch).
  const sp = seg(t, 0.36, 0.72);
  if (sp > 0) {
    g.sats.forEach((s, i) => {
      const r = s.r * (1 - sp);
      if (r < 0.4) return;
      out.balls.set(
        [
          g.cx + s.ox + s.vx * sp * 30,
          g.notchBottom + 22 + s.vy * sp * 30 + 12 * sp * sp,
          r,
          1,
        ],
        (S_SAT + i) * 4,
      );
    });
  }

  if (t < BLOOM_AT) {
    // Descend with gravity easing; the bead stretches into a teardrop mid-fall
    // while the neck thickens, thins, then pinches off.
    const desc = Math.pow(seg(t, 0.06, BLOOM_AT), 1.65);
    const beadCy = lerp(nb + 6, g.dropCy, desc);
    const beadR = lerp(6, BEAD_R, sm0(seg(t, 0.04, 0.46)));
    const stretch = 1 + 0.24 * Math.sin(seg(t, 0.24, 0.55) * Math.PI);
    const thick = sm0(seg(t, 0, 0.16));
    const pinch = sm0(seg(t, 0.26, 0.4));
    const neckR = (2 + 11 * thick) * (1 - pinch);
    if (neckR > 0.3) {
      out.balls.set([g.cx, lerp(nb + 4, beadCy, 0.5), neckR, 1], S_NECK * 4);
    }
    out.balls.set([g.cx + wob * 1.2, beadCy, beadR, stretch], S_BEAD * 4);
  } else {
    // Bloom: the bead squashes on landing and the liquid races outward —
    // spread fronts lead the widening edges, drips sag off the bottom, lobes
    // ripple along the top — while the height fills with a soft overshoot.
    const bp = seg(t, BLOOM_AT, 0.93);
    const wid = lerp(2 * BEAD_R, g.bloomW, easeOutCubic(bp));
    const settle = Math.sin(bp * Math.PI * 2.5) * (1 - bp) * 6;
    const hei = lerp(2 * BEAD_R * 0.78, g.bloomH, backOut(bp, 1.12)) + settle;
    const cy = lerp(g.dropCy, g.bloomCy, sm0(bp));
    const rad = Math.min(
      lerp(BEAD_R * 1.3, DIALOG_R, sm0(bp)),
      wid / 2,
      hei / 2,
    );
    out.bloom = [g.cx - wid / 2, cy - hei / 2, wid, hei];
    out.bloomR = rad;

    // Residual bead melts into the rect so the landing squash reads smoothly.
    const beadFade = 1 - sm0(seg(bp, 0, 0.35));
    if (beadFade > 0.02) {
      out.balls.set(
        [g.cx, cy, BEAD_R * beadFade, 1 - 0.3 * sm0(seg(bp, 0, 0.4))],
        S_BEAD * 4,
      );
    }

    // Spread fronts: tall flattened bulges anchored ON the widening edges —
    // centering them off the edge reads as pointy nubs, not liquid.
    const fr = 16 * Math.pow(1 - bp, 1.5) * sm0(seg(bp, 0, 0.25));
    if (fr > 1.5) {
      out.balls.set(
        [g.cx - wid / 2 + 2, cy + Math.sin(t * 5 + g.seed) * 8, fr, 1.6],
        S_FRONT * 4,
      );
      out.balls.set(
        [g.cx + wid / 2 - 2, cy + Math.sin(t * 5.5 + g.seed + 2) * 8, fr, 1.6],
        (S_FRONT + 1) * 4,
      );
    }

    const top = cy - hei / 2;
    const left = g.cx - wid / 2;

    // Bottom drips: heavy bulges sagging just below the edge, reabsorbed.
    const dripF = Math.sin(bp * Math.PI) * (1 - bp * 0.6);
    if (dripF > 0.05) {
      const bot = cy + hei / 2;
      for (let i = 0; i < 3; i++) {
        const fx =
          lerp(left + rad, left + wid - rad, (i + 0.5) / 3) +
          Math.sin(t * 6 + i * 2.1 + g.seed) * 7;
        const dr = (7 + 3 * Math.sin(t * 7 + i * 1.3)) * dripF;
        if (dr > 1.5) {
          out.balls.set(
            [fx, bot - 2 + dr * 0.4, dr, 1.25],
            (S_DRIP + i) * 4,
          );
        }
      }
    }

    // Top lobes keep the leading edge organic while it settles.
    const lobF = Math.pow(1 - bp, 1.15);
    if (lobF > 0.02) {
      for (let i = 0; i < 4; i++) {
        const fx =
          lerp(left + rad, left + wid - rad, (i + 0.5) / 4) +
          Math.sin(t * 7 + i * 1.7 + g.seed) * 6;
        const lr = (8 + 4 * Math.sin(t * 8 + i * 2)) * lobF;
        if (lr > 1.5) {
          out.balls.set(
            [fx, top + 1 + Math.sin(t * 6 + i) * 2, lr, 1],
            (S_LOBE + i) * 4,
          );
        }
      }
    }
  }
}

function frameClose(t: number, g: Geometry, out: Frame) {
  const wob = Math.sin(t * 20 + g.seed);
  out.balls.fill(0);
  out.bloom[2] = 0;
  out.alpha = 1;

  const shrink = sm0(seg(t, 0, 0.5));
  const rise = sm0(Math.pow(seg(t, 0.24, 0.94), 0.9));
  const cy = lerp(g.bloomCy, g.notchBottom + 8, rise);

  // The notch re-forms out of the panel edge (reverse of the open's melt),
  // swells to swallow the bead, and is back at rest by t=1 (the DOM notch
  // restyles the moment the canvas goes).
  const emerge = sm0(seg(t, 0.4, 0.72));
  const ab = seg(t, 0.78, 1);
  const swell = ab > 0 ? Math.sin(ab * Math.PI * 2) * (1 - ab) * 5 : 0;
  const notchW = lerp(NOTCH_WIDTH * 1.3, NOTCH_WIDTH, emerge);
  const notchH = lerp(0, NOTCH_HEIGHT, emerge) + swell;
  if (notchH > 0.5) {
    out.notch = [g.cx - notchW / 2, METABALL_PAD, notchW, notchH];
    out.notchR = Math.min(lerp(26, NOTCH_R, emerge), notchH / 2);
  } else {
    out.notch = [0, 0, 0, 0];
    out.notchR = 0;
  }

  if (shrink < 0.84) {
    const wid = lerp(g.bloomW, 2 * BEAD_R, shrink);
    const hei = lerp(g.bloomH, 2 * BEAD_R, shrink);
    const rad = Math.min(lerp(DIALOG_R, BEAD_R, shrink), wid / 2, hei / 2);
    out.bloom = [g.cx - wid / 2, cy - hei / 2, wid, hei];
    out.bloomR = rad;

    // Bulge while collapsing, vanishing at both ends.
    const lobF = shrink * (1 - shrink) * 4;
    if (lobF > 0.02) {
      const top = cy - hei / 2;
      const left = g.cx - wid / 2;
      for (let i = 0; i < 4; i++) {
        const fx =
          lerp(left + rad, left + wid - rad, (i + 0.5) / 4) +
          Math.sin(t * 8 + i) * 5;
        const lr = (6 + 4 * Math.sin(t * 9 + i * 2)) * lobF;
        if (lr > 1.5) {
          out.balls.set(
            [fx, top + 1 + Math.sin(t * 7 + i) * 2, lr, 1],
            (S_LOBE + i) * 4,
          );
        }
      }
    }
  } else {
    // Small teardrop pulled upward, wobbling, stretching toward the notch.
    const r = lerp(BEAD_R, 7, sm0(seg(t, 0.5, 1)));
    const stretch =
      1 + 0.55 * sm0(seg(t, 0.48, 0.82)) * (1 - sm0(seg(t, 0.86, 1)));
    out.balls.set([g.cx + wob, cy, r, stretch], S_BEAD * 4);
  }

  // Neck reforms and a belly reaches down as the bead nears the notch.
  // Time-based (not distance): a short bar starts close enough to the edge
  // that a distance ramp would fire from the first frame.
  const near = sm0(seg(t, 0.55, 0.9));
  const fade = 1 - sm0(seg(t, 0.93, 1));
  const neckR = near * near * 9 * fade;
  if (neckR > 0.4) {
    out.balls.set(
      [g.cx, lerp(g.notchBottom + 4, cy, 0.5), neckR, 1],
      S_NECK * 4,
    );
  }
  const bellyR = near * near * 11 * fade;
  if (bellyR > 0.5) {
    out.balls.set([g.cx, METABALL_PAD + notchH - 2, bellyR, 0.6], S_BELLY * 4);
  }
}

function compileProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const compile = (type: number, src: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return shader;
  };
  const vert = compile(gl.VERTEX_SHADER, VERT_SRC);
  const frag = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vert || !frag) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return program;
}

type FindPageMetaballProps = {
  mode: "open" | "close";
  /** Resolved dialog width in CSS px (bloom target). */
  dialogWidth: number;
  /** Lazily measures the mounted dialog's height; null if not yet available. */
  measureDialogHeight: () => number | null;
};

/**
 * WebGL liquid layer for the find-page sequence. Everything is one SDF drawn
 * by a fragment shader; per frame the CPU only evaluates the eased timeline
 * and updates uniforms — no filters, no DOM writes, no React renders.
 *
 * While this canvas is mounted the DOM notch above it is ghosted (transparent
 * bg/border, hidden label), so the shader's notch rect — animated per frame —
 * owns the silhouette: it liquefies into a goo blob, drains into the bead,
 * and melts into the panel edge (re-emerging from it on close).
 */
export function FindPageMetaball({
  mode,
  dialogWidth,
  measureDialogHeight,
}: FindPageMetaballProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  // The canvas is created per effect run (not rendered by React): StrictMode
  // re-invokes effects, and a canvas whose WebGL context was lost by the
  // previous cleanup can never yield a working context again.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement("canvas");
    canvas.className = "block";
    host.appendChild(canvas);
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) {
      canvas.remove();
      return;
    }

    const dialogH = measureDialogHeight() ?? FALLBACK_DIALOG_H;
    const cssW = Math.max(dialogWidth, NOTCH_WIDTH) + METABALL_PAD * 2;
    const cssH = METABALL_PAD * 2 + METABALL_DROP + dialogH;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const program = compileProgram(gl);
    if (!program) {
      canvas.remove();
      return;
    }
    gl.useProgram(program);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const loc = (name: string) => gl.getUniformLocation(program, name);
    const cx = cssW / 2;
    const ink = parseColor(getComputedStyle(host).color);
    gl.uniform2f(loc("u_size"), cssW, cssH);
    gl.uniform1f(loc("u_dpr"), dpr);
    gl.uniform3f(loc("u_ink"), ink[0], ink[1], ink[2]);
    const notchLoc = loc("u_notch");
    const notchRLoc = loc("u_notchR");
    const bloomLoc = loc("u_bloom");
    const bloomRLoc = loc("u_bloomR");
    const ballsLoc = loc("u_balls[0]");
    const alphaLoc = loc("u_alpha");

    const geometry: Geometry = {
      cx,
      notchBottom: METABALL_PAD + NOTCH_HEIGHT,
      // The bead overshoots below the bar's final center and rises into place
      // during the bloom; the floor keeps the fall readable for short bars.
      dropCy:
        METABALL_PAD +
        METABALL_DROP +
        Math.min(Math.max(dialogH * 0.42, 64), 220),
      bloomW: dialogWidth,
      bloomH: dialogH,
      bloomCy: METABALL_PAD + METABALL_DROP + dialogH / 2,
      seed: Math.random() * 1000,
      sats: Array.from({ length: SATELLITES }, () => ({
        ox: (Math.random() * 2 - 1) * 6,
        vx: (Math.random() * 2 - 1) * 1.5,
        vy: (Math.random() * 2 - 1) * 0.5,
        r: 2.4 + Math.random() * 2.2,
      })),
    };

    const frame: Frame = {
      balls: new Float32Array(MAX_BALLS * 4),
      notch: [cx - NOTCH_WIDTH / 2, METABALL_PAD, NOTCH_WIDTH, NOTCH_HEIGHT],
      notchR: NOTCH_R,
      bloom: [0, 0, 0, 0],
      bloomR: 0,
      alpha: 1,
    };

    const durMs =
      (mode === "open"
        ? FIND_PAGE_METABALL.openSec
        : FIND_PAGE_METABALL.closeSec) * 1000;
    const t0 = performance.now();
    let raf = 0;

    const draw = () => {
      const t = Math.min((performance.now() - t0) / durMs, 1);
      if (mode === "open") frameOpen(t, geometry, frame);
      else frameClose(t, geometry, frame);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform4f(notchLoc, ...frame.notch);
      gl.uniform1f(notchRLoc, frame.notchR);
      gl.uniform4f(bloomLoc, ...frame.bloom);
      gl.uniform1f(bloomRLoc, frame.bloomR);
      gl.uniform4fv(ballsLoc, frame.balls);
      gl.uniform1f(alphaLoc, frame.alpha);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (t < 1) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [mode, dialogWidth, measureDialogHeight]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      // sj-root scopes --find-page-ink; the effect reads it via computed color.
      className="sj-root pointer-events-none"
      style={{ color: "var(--find-page-ink)" }}
    />
  );
}
