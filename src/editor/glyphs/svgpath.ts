/**
 * SVG path data → PDF path operators. Supports M L H V C S Q T A Z (absolute and
 * relative). Quadratics and arcs are converted to cubic Béziers.
 */
type Pt = [number, number];

const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

export function tokenizePath(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  let i = 0;
  while (i < d.length) {
    const c = d[i]!;
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(c)) {
      out.push(c);
      i++;
    } else if (/[\s,]/.test(c)) i++;
    else {
      NUM.lastIndex = i;
      const m = NUM.exec(d);
      if (!m) throw new Error(`Invalid path data near "${d.slice(i, i + 10)}"`);
      out.push(parseFloat(m[0]));
      i = NUM.lastIndex;
    }
  }
  return out;
}

export type Seg = { op: "M" | "L"; p: Pt } | { op: "C"; c1: Pt; c2: Pt; p: Pt } | { op: "Z" };

/** Parses to absolute M / L / C / Z segments. */
export function parsePath(d: string): Seg[] {
  const t = tokenizePath(d);
  const segs: Seg[] = [];
  let i = 0;
  let cmd = "";
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let lastC: Pt | null = null; // last cubic control (for S)
  let lastQ: Pt | null = null; // last quadratic control (for T)
  const num = () => {
    const v = t[i++];
    if (typeof v !== "number") throw new Error("Invalid path data: expected a number.");
    return v;
  };
  const quad = (q: Pt, p: Pt) => {
    const c1: Pt = [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])];
    const c2: Pt = [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])];
    segs.push({ op: "C", c1, c2, p });
  };
  while (i < t.length) {
    if (typeof t[i] === "string") cmd = t[i++] as string;
    else if (!cmd) throw new Error("Invalid path data: missing command.");
    const rel = cmd === cmd.toLowerCase();
    const R = (x: number, y: number): Pt => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    const C = cmd.toUpperCase();
    let nextC: Pt | null = null;
    let nextQ: Pt | null = null;
    switch (C) {
      case "M": {
        cur = R(num(), num());
        start = cur;
        segs.push({ op: "M", p: cur });
        cmd = rel ? "l" : "L";
        break;
      }
      case "L":
        cur = R(num(), num());
        segs.push({ op: "L", p: cur });
        break;
      case "H": {
        const x = num();
        cur = [rel ? cur[0] + x : x, cur[1]];
        segs.push({ op: "L", p: cur });
        break;
      }
      case "V": {
        const y = num();
        cur = [cur[0], rel ? cur[1] + y : y];
        segs.push({ op: "L", p: cur });
        break;
      }
      case "C": {
        const c1 = R(num(), num());
        const c2 = R(num(), num());
        const p = R(num(), num());
        segs.push({ op: "C", c1, c2, p });
        cur = p;
        nextC = c2;
        break;
      }
      case "S": {
        const c1: Pt = lastC ? [2 * cur[0] - lastC[0], 2 * cur[1] - lastC[1]] : cur;
        const c2 = R(num(), num());
        const p = R(num(), num());
        segs.push({ op: "C", c1, c2, p });
        cur = p;
        nextC = c2;
        break;
      }
      case "Q": {
        const q = R(num(), num());
        const p = R(num(), num());
        quad(q, p);
        cur = p;
        nextQ = q;
        break;
      }
      case "T": {
        const q: Pt = lastQ ? [2 * cur[0] - lastQ[0], 2 * cur[1] - lastQ[1]] : cur;
        const p = R(num(), num());
        quad(q, p);
        cur = p;
        nextQ = q;
        break;
      }
      case "A": {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num();
        const sweep = num();
        const p = R(num(), num());
        for (const [c1, c2, e] of arcToCubics(cur, rx, ry, rot, !!large, !!sweep, p)) segs.push({ op: "C", c1, c2, p: e });
        cur = p;
        break;
      }
      case "Z":
        segs.push({ op: "Z" });
        cur = start;
        break;
      default:
        throw new Error(`Unsupported path command ${cmd}`);
    }
    lastC = nextC;
    lastQ = nextQ;
  }
  return segs;
}

/** SVG elliptical arc (endpoint form) → cubic Béziers (SVG spec F.6.5). */
export function arcToCubics(p0: Pt, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, p1: Pt): [Pt, Pt, Pt][] {
  if ((p0[0] === p1[0] && p0[1] === p1[1]) || !rx || !ry) return [[p0, p1, p1]];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let co = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) co = -co;
  const cxp = (co * rx * y1) / ry;
  const cyp = (-co * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (p0[0] + p1[0]) / 2;
  const cy = sin * cxp + cos * cyp + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n;
  const kappa = (4 / 3) * Math.tan(step / 4);
  const pt = (t: number): Pt => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const deriv = (t: number): Pt => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const out: [Pt, Pt, Pt][] = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * step;
    const b = a + step;
    const pa = pt(a);
    const pb = i === n - 1 ? p1 : pt(b);
    const da = deriv(a);
    const db = deriv(b);
    out.push([[pa[0] + kappa * da[0], pa[1] + kappa * da[1]], [pb[0] - kappa * db[0], pb[1] - kappa * db[1]], pb]);
  }
  return out;
}

const f = (n: number) => {
  const s = (Math.abs(n) < 1e-9 ? 0 : n).toFixed(3).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
};

export function pathToPdfOps(d: string): string {
  return parsePath(d)
    .map((s) =>
      s.op === "M" ? `${f(s.p[0])} ${f(s.p[1])} m` : s.op === "L" ? `${f(s.p[0])} ${f(s.p[1])} l` : s.op === "C" ? `${f(s.c1[0])} ${f(s.c1[1])} ${f(s.c2[0])} ${f(s.c2[1])} ${f(s.p[0])} ${f(s.p[1])} c` : "h",
    )
    .join("\n");
}
