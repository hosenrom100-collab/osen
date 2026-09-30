import { Program } from "./types";

// One hue per program, so the colour tells you whose session it is. Stored on the program, else derived from its id.
export const PROGRAM_HUES = [212, 152, 28, 282, 348, 184, 48, 252];

export function programHue(p: Pick<Program, "id" | "color"> | undefined, fallbackId = ""): number {
  if (p?.color !== undefined) return p.color;
  const id = p?.id || fallbackId;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PROGRAM_HUES[h % PROGRAM_HUES.length];
}

export const hueStyle = (hue: number) => ({
  bg: `hsl(${hue} 60% 96%)`,
  border: `hsl(${hue} 35% 86%)`,
  accent: `hsl(${hue} 55% 42%)`,
  ink: `hsl(${hue} 50% 24%)`,
});
