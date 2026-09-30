import { Program, Session } from "./types";
import { ActivityType, pastel, typeById } from "./activityTypes";

// One hue per program, so the colour tells you whose session it is. Stored on the program, else derived from its id.
export const PROGRAM_HUES = [212, 152, 28, 282, 348, 184, 48, 252];

const hashHue = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PROGRAM_HUES[h % PROGRAM_HUES.length];
};

export function programHue(p: Pick<Program, "id" | "color"> | undefined, fallbackId = ""): number {
  return p?.color !== undefined ? p.color : hashHue(p?.id || fallbackId);
}

export type ColorBy = "type" | "program" | "workshop";

/** The hue a session is drawn with, given what the viewer chose to colour by. */
export function sessionHue(s: Session, by: ColorBy, types: ActivityType[], programs: Program[]): number {
  if (by === "type") return typeById(types, s.activity).hue;
  if (by === "program") return programHue(programs.find(p => p.id === s.programId), s.programId);
  return hashHue(s.workshopId);
}

export const hueStyle = pastel;
