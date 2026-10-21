/** A cell offset within a piece: [row, col]. */
export type Cell = readonly [number, number];

export interface Shape {
  id: string;
  cells: readonly Cell[];
  /** Relative spawn weight; higher means more common. */
  weight: number;
  rows: number;
  cols: number;
}

export interface Piece {
  shape: Shape;
  color: number;
}

/** Block colors, indexed by Piece.color. Board cells store color + 1. */
export const COLORS = [
  '#ef4b4b', // red
  '#ff9a1f', // orange
  '#ffd23f', // yellow
  '#3ccf6e', // green
  '#27c2e8', // cyan
  '#3d7bff', // blue
  '#a259ff', // purple
  '#ff5fa8', // pink
] as const;

function parse(id: string, weight: number, art: string): Shape {
  const lines = art
    .trim()
    .split('\n')
    .map((l) => l.trim());
  const cells: Cell[] = [];
  lines.forEach((line, r) => {
    [...line].forEach((ch, c) => {
      if (ch === '#') cells.push([r, c]);
    });
  });
  const rows = Math.max(...cells.map(([r]) => r)) + 1;
  const cols = Math.max(...cells.map(([, c]) => c)) + 1;
  return { id, cells, weight, rows, cols };
}

/** Rotate an ASCII-art shape 90° clockwise. */
function rotate(art: string): string {
  const lines = art
    .trim()
    .split('\n')
    .map((l) => l.trim());
  const h = lines.length;
  const w = Math.max(...lines.map((l) => l.length));
  const out: string[] = [];
  for (let c = 0; c < w; c++) {
    let row = '';
    for (let r = h - 1; r >= 0; r--) row += lines[r][c] ?? '.';
    out.push(row);
  }
  return out.join('\n');
}

/** Register a shape with all of its distinct rotations. */
function withRotations(id: string, weight: number, art: string, count = 4): Shape[] {
  const shapes: Shape[] = [];
  const seen = new Set<string>();
  let current = art.trim();
  for (let i = 0; i < count; i++) {
    const key = current
      .split('\n')
      .map((l) => l.trim())
      .join('/');
    if (!seen.has(key)) {
      seen.add(key);
      shapes.push(parse(`${id}${i}`, weight, current));
    }
    current = rotate(current);
  }
  // Spread the family weight across its rotations so a family with many
  // rotations isn't over-represented.
  return shapes.map((s) => ({ ...s, weight: weight / shapes.length }));
}

export const SHAPES: readonly Shape[] = [
  parse('dot', 2, '#'),
  ...withRotations('i2', 3, '##', 2),
  ...withRotations('i3', 4, '###', 2),
  ...withRotations('i4', 4, '####', 2),
  ...withRotations('i5', 3, '#####', 2),
  parse('sq2', 5, '##\n##'),
  parse('sq3', 2.5, '###\n###\n###'),
  ...withRotations('rect', 3, '###\n###', 2),
  ...withRotations('l3', 4, '#.\n##'),
  ...withRotations('l4', 4, '#.\n#.\n##'),
  ...withRotations('j4', 4, '.#\n.#\n##'),
  ...withRotations('l5', 3, '#..\n#..\n###'),
  ...withRotations('t', 4, '###\n.#.'),
  ...withRotations('s', 3, '.##\n##.', 2),
  ...withRotations('z', 3, '##.\n.##', 2),
];

export type Rng = () => number;

export function randomShape(rng: Rng): Shape {
  const total = SHAPES.reduce((sum, s) => sum + s.weight, 0);
  let roll = rng() * total;
  for (const s of SHAPES) {
    roll -= s.weight;
    if (roll < 0) return s;
  }
  return SHAPES[SHAPES.length - 1];
}

export function randomPiece(rng: Rng): Piece {
  return { shape: randomShape(rng), color: Math.floor(rng() * COLORS.length) };
}

export function shapeById(id: string): Shape | undefined {
  return SHAPES.find((s) => s.id === id);
}
