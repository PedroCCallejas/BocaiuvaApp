/** Remove only near-white pixels connected to an edge. Never sends images to a service. */
export function removeBorderWhite(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data);
  if (width <= 0 || height <= 0 || data.length !== width * height * 4) return output;
  const seen = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0, tail = 0;
  const visit = (p: number) => {
    if (seen[p]) return;
    seen[p] = 1;
    const i = p * 4;
    const low = Math.min(data[i], data[i + 1], data[i + 2]);
    const high = Math.max(data[i], data[i + 1], data[i + 2]);
    if (data[i + 3] === 0 || (low >= 220 && high - low <= 30)) {
      output[i + 3] = 0;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (head < tail) {
    const p = queue[head++], x = p % width, y = Math.floor(p / width);
    if (x > 0) visit(p - 1);
    if (x + 1 < width) visit(p + 1);
    if (y > 0) visit(p - width);
    if (y + 1 < height) visit(p + width);
  }
  return output;
}
