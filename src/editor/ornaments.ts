import type { Contour, PathNode, PathObject } from "./model";
import { createPathObject } from "./paths/edit";

const rotate = (x: number, y: number, a: number): [number, number] => [
  x * Math.cos(a) - y * Math.sin(a),
  x * Math.sin(a) + y * Math.cos(a),
];

function petal(angle: number, radius: number, width: number): Contour {
  const points: [number, number][] = [
    [0, -radius],
    [width, -radius * 0.56],
    [0, -radius * 0.18],
    [-width, -radius * 0.56],
  ];
  const tangent = radius * 0.22;
  const handles: [number, number][] = [
    [tangent, 0],
    [0, tangent * 0.7],
    [-tangent, 0],
    [0, -tangent * 0.7],
  ];
  const nodes: PathNode[] = points.map(([x, y], i) => {
    const [px, py] = rotate(x, y, angle);
    const [hx, hy] = rotate(...handles[i]!, angle);
    const [ix, iy] = rotate(-handles[i]![0], -handles[i]![1], angle);
    return { x: px, y: py, in: [ix, iy], out: [hx, hy], type: "smooth" };
  });
  return { nodes, closed: true };
}

function ring(radius: number): Contour {
  const k = radius * 0.5522847498;
  return {
    closed: true,
    nodes: [
      { x: 0, y: -radius, in: [-k, 0], out: [k, 0], type: "smooth" },
      { x: radius, y: 0, in: [0, -k], out: [0, k], type: "smooth" },
      { x: 0, y: radius, in: [k, 0], out: [-k, 0], type: "smooth" },
      { x: -radius, y: 0, in: [0, k], out: [0, -k], type: "smooth" },
    ],
  };
}

/** An eight-petal editable Bézier rosette, stored as one multi-contour path. */
export function createFloralRosette(x: number, y: number, size: number): PathObject {
  const radius = size * 0.48;
  const contours = Array.from({ length: 8 }, (_, i) => petal((i * Math.PI) / 4, radius, size * 0.105));
  contours.push(ring(size * 0.13));
  return createPathObject(contours, {
    name: "وردة نباتية — مسارات Bézier",
    x,
    y,
    fill: "transparent",
    stroke: "#a0703a",
    strokeWidth: Math.max(2, size * 0.012),
    lineCap: "round",
    lineJoin: "round",
  });
}
