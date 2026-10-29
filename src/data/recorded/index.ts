// Written by scripts/record.mts. Saved real runs for the demo students, replayed on request
// so judges see a full run instantly without spending credits. Server-side only.
import type { Recording } from "@/lib/types";
import kavya from "./kavya.json";
import arjun from "./arjun.json";
import sana from "./sana.json";

export const RECORDINGS: Record<string, Recording> = { "Kavya": kavya as Recording, "Arjun": arjun as Recording, "Sana": sana as Recording };
