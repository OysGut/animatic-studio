/** Keep rapid additions separate even before the optimistic state reaches this render. */
export function nextCanvasPosition(center: { x: number; y: number }, last: { x: number; y: number } | null, occupied: readonly { x: number; y: number }[]) {
  const taken = (pos: { x: number; y: number }) => occupied.some((node) => Math.abs(node.x - pos.x) < 12 && Math.abs(node.y - pos.y) < 12);
  let pos = taken(center) && last ? { ...last } : { ...center };
  while (taken(pos)) pos = { x: pos.x + 24, y: pos.y + 24 };
  return pos;
}