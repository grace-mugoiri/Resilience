/** Decorative, deterministic pseudo-QR pattern derived from the address
 * string — NOT a real scannable QR code. This is a mock wallet; nothing
 * here encodes a real payment request. */
function seededGrid(value: string, cells: number): boolean[] {
  let state = 0;
  for (let i = 0; i < value.length; i++) state = (state * 31 + value.charCodeAt(i)) >>> 0;

  const grid: boolean[] = [];
  for (let i = 0; i < cells * cells; i++) {
    state = (state * 1103515245 + 12345) >>> 0;
    grid.push(state / 0xffffffff > 0.55);
  }
  return grid;
}

export function MockQr({ value, size = 160 }: { value: string; size?: number }) {
  const cells = 12;
  const grid = seededGrid(value, cells);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${cells} ${cells}`} role="img" aria-label="Mock payment QR code">
      <rect width={cells} height={cells} fill="white" />
      {grid.map((filled, i) =>
        filled ? (
          <rect key={i} x={i % cells} y={Math.floor(i / cells)} width={1} height={1} fill="#1c1730" />
        ) : null
      )}
    </svg>
  );
}
