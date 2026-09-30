// Soft pastel tint per workshop, stable across weeks (derived from the workshop id).
const HUES = [8, 32, 52, 92, 145, 172, 198, 222, 252, 282, 315, 342];

export function workshopColor(workshopId: string) {
  let h = 0;
  for (let i = 0; i < workshopId.length; i++) h = (h * 31 + workshopId.charCodeAt(i)) >>> 0;
  const hue = HUES[h % HUES.length];
  return { bg: `hsl(${hue} 70% 92%)`, border: `hsl(${hue} 45% 80%)` };
}
