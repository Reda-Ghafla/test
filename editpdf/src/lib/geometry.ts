/**
 * 2D affine matrices in PDF order [a, b, c, d, e, f]:
 *   x' = a·x + c·y + e,   y' = b·x + d·y + f
 */
export type Mat = [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** Compose matrices so that they apply left to right: compose(A, B) = "A, then B". */
export function compose(...ms: Mat[]): Mat {
  return ms.reduce((m1, m2) => [
    m2[0] * m1[0] + m2[2] * m1[1],
    m2[1] * m1[0] + m2[3] * m1[1],
    m2[0] * m1[2] + m2[2] * m1[3],
    m2[1] * m1[2] + m2[3] * m1[3],
    m2[0] * m1[4] + m2[2] * m1[5] + m2[4],
    m2[1] * m1[4] + m2[3] * m1[5] + m2[5],
  ], IDENTITY);
}

export const apply = (m: Mat, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];

/**
 * Map a w × h box (y down) into the box it occupies after a clockwise screen
 * rotation of `deg`, with the rotated box's top-left at the origin.
 */
export function rotateBox(deg: number, w: number, h: number): Mat {
  switch (((deg % 360) + 360) % 360) {
    case 90:
      return [0, 1, -1, 0, h, 0];
    case 180:
      return [-1, 0, 0, -1, w, h];
    case 270:
      return [0, -1, 1, 0, 0, w];
    default:
      return IDENTITY;
  }
}

/**
 * Display space (what the user sees, y down, page rotated by `deg`) →
 * unrotated page space (y down), for an unrotated page of size w × h.
 * This is the inverse of rotateBox(deg, w, h).
 */
export function unrotatePage(deg: number, w: number, h: number): Mat {
  switch (((deg % 360) + 360) % 360) {
    case 90:
      return [0, -1, 1, 0, 0, h];
    case 180:
      return [-1, 0, 0, -1, w, h];
    case 270:
      return [0, 1, -1, 0, w, 0];
    default:
      return IDENTITY;
  }
}
