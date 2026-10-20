/**
 * Story Lab (SL1): karakterprofilen – psykologi, tale, dramatikk og person. Ren data og validering.
 * Profilen hører til en ressurs av typen «character» eller «animal» (Mars 18.10.2026).
 * Lengdegrensene her er strengere enn i databasen (databasen er siste sperre).
 */

import { t } from "@/core/i18n/keyed";

export type SpeechLevel = "child" | "youth" | "adult" | "academic" | "street";
export const SPEECH_LEVELS: readonly SpeechLevel[] = [
  "child",
  "youth",
  "adult",
  "academic",
  "street",
];
export type Formality = "low" | "medium" | "high";
const FORMALITIES: readonly Formality[] = ["low", "medium", "high"];

export interface StoryProfile {
  readonly psychology: {
    readonly hiddenMotives: readonly string[];
    readonly techniques: readonly string[];
    readonly neverSay: readonly string[];
    readonly blindSpots: readonly string[];
    readonly triggers: readonly string[];
    readonly facade: string;
    readonly reality: string;
    readonly demonstrations: readonly string[];
  };
  readonly speech: {
    readonly level: SpeechLevel;
    readonly wordChoice: string;
    readonly mood: string;
    readonly typicalVocabulary: readonly string[];
    readonly forbiddenExpressions: readonly string[];
    readonly examples: readonly string[];
    readonly maxWords?: number;
  };
  readonly dramatic: {
    readonly goals: readonly string[];
    readonly innerContradictions: readonly string[];
    readonly vulnerabilities: readonly string[];
    readonly hides: readonly string[];
    readonly beliefsAboutOthers: readonly { readonly assetId: string; readonly belief: string }[];
  };
  readonly person: {
    readonly age?: number;
    readonly occupation?: string;
    readonly background?: string;
    readonly values: readonly string[];
    readonly dialect?: string;
    readonly formality?: Formality;
  };
  readonly notes: string;
}

/** Delvis profil (stadier): objekter slås sammen, lister og tekster erstattes helt. */
export type StoryProfilePatch = {
  readonly [K in keyof StoryProfile]?: StoryProfile[K] extends string
    ? string
    : Partial<StoryProfile[K]>;
};

export const PROFILE_LIMITS = {
  short: 200,
  text: 2000,
  listItems: 30,
  item: 500,
  examples: 20,
  notes: 8000,
  total: 60_000,
} as const;

export function emptyStoryProfile(): StoryProfile {
  return {
    psychology: {
      hiddenMotives: [],
      techniques: [],
      neverSay: [],
      blindSpots: [],
      triggers: [],
      facade: "",
      reality: "",
      demonstrations: [],
    },
    speech: {
      level: "adult",
      wordChoice: "",
      mood: "",
      typicalVocabulary: [],
      forbiddenExpressions: [],
      examples: [],
    },
    dramatic: {
      goals: [],
      innerContradictions: [],
      vulnerabilities: [],
      hides: [],
      beliefsAboutOthers: [],
    },
    person: { values: [] },
    notes: "",
  };
}

type Kind =
  "list" | "examples" | "short" | "text" | "level" | "maxWords" | "age" | "formality" | "beliefs";
const SCHEMA: Record<string, Record<string, Kind>> = {
  psychology: {
    hiddenMotives: "list",
    techniques: "list",
    neverSay: "list",
    blindSpots: "list",
    triggers: "list",
    facade: "text",
    reality: "text",
    demonstrations: "examples",
  },
  speech: {
    level: "level",
    wordChoice: "text",
    mood: "text",
    typicalVocabulary: "list",
    forbiddenExpressions: "list",
    examples: "examples",
    maxWords: "maxWords",
  },
  dramatic: {
    goals: "list",
    innerContradictions: "list",
    vulnerabilities: "list",
    hides: "list",
    beliefsAboutOthers: "beliefs",
  },
  person: {
    age: "age",
    occupation: "short",
    background: "text",
    values: "list",
    dialect: "short",
    formality: "formality",
  },
};
const OPTIONAL = new Set(["maxWords", "age", "occupation", "background", "dialect", "formality"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function fieldError(path: string, kind: Kind, v: unknown): string | null {
  const bad = () =>
    t("core-storylab-profile.bad.message.d4b7aa2ffb14", { path: String(path) });
  const long = () =>
    t("core-storylab-profile.long.message.f291dc84a55c", { path: String(path) });
  const strList = (max: number) => {
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return bad();
    if (v.length > max)
      return t("core-storylab-profile.str-list.message.203544f90a07", { path: String(path) });
    return v.some((x: string) => x.length > PROFILE_LIMITS.item) ? long() : null;
  };
  switch (kind) {
    case "list":
      return strList(PROFILE_LIMITS.listItems);
    case "examples":
      return strList(PROFILE_LIMITS.examples);
    case "short":
      if (typeof v !== "string") return bad();
      return v.length > PROFILE_LIMITS.short ? long() : null;
    case "text":
      if (typeof v !== "string") return bad();
      return v.length > PROFILE_LIMITS.text ? long() : null;
    case "level":
      return SPEECH_LEVELS.includes(v as SpeechLevel) ? null : bad();
    case "formality":
      return FORMALITIES.includes(v as Formality) ? null : bad();
    case "maxWords":
      return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 500 ? null : bad();
    case "age":
      return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 200 ? null : bad();
    case "beliefs":
      if (!Array.isArray(v) || v.length > PROFILE_LIMITS.listItems) return bad();
      for (const b of v as unknown[]) {
        if (!b || typeof b !== "object") return bad();
        const x = b as Record<string, unknown>;
        if (typeof x["assetId"] !== "string" || !UUID.test(x["assetId"])) return bad();
        if (typeof x["belief"] !== "string") return bad();
        if (x["belief"].length > PROFILE_LIMITS.item) return long();
        if (Object.keys(x).some((k) => k !== "assetId" && k !== "belief")) return bad();
      }
      return null;
  }
}

function check(p: unknown, partial: boolean): string | null {
  if (!p || typeof p !== "object" || Array.isArray(p))
    return t("core-storylab-profile.check.message.01a5a98213fa");
  const o = p as Record<string, unknown>;
  for (const k of Object.keys(o))
    if (k !== "notes" && !(k in SCHEMA))
      return t("core-storylab-profile.check.message.9448da9c16fe", { k: String(k) });
  if (o["notes"] !== undefined || !partial) {
    if (typeof o["notes"] !== "string")
      return t("core-storylab-profile.check.message.4924658f6b50");
    if (o["notes"].length > PROFILE_LIMITS.notes)
      return t("core-storylab-profile.check.message.ee7f34e157ac");
  }
  for (const [sec, fields] of Object.entries(SCHEMA)) {
    const part = o[sec];
    if (part === undefined && partial) continue;
    if (!part || typeof part !== "object" || Array.isArray(part))
      return t("core-storylab-profile.check.message.d66339497b0c", { sec: String(sec) });
    const po = part as Record<string, unknown>;
    for (const k of Object.keys(po))
      if (!(k in fields))
        return t("core-storylab-profile.check.message.6653a46b9506", { sec: String(sec), k: String(k) });
    for (const [f, kind] of Object.entries(fields)) {
      const v = po[f];
      if (v === undefined) {
        if (partial || OPTIONAL.has(f)) continue;
        return t("core-storylab-profile.check.message.cf645cedeb54", { sec: String(sec), f: String(f) });
      }
      const e = fieldError(`${sec}.${f}`, kind, v);
      if (e) return e;
    }
  }
  if (JSON.stringify(p).length > PROFILE_LIMITS.total)
    return t("core-storylab-profile.check.message.61ca3abe01e6");
  return null;
}

/** Feil i en hel profil, eller null. */
export function profileError(p: unknown): string | null {
  return check(p, false);
}

/** Feil i en delvis profil (stadium), eller null. */
export function profilePatchError(p: unknown): string | null {
  return check(p, true);
}

/** Grunnprofilen med stadiet lagt over: objekter slås sammen, lister og tekster erstattes. */
export function mergeProfile(base: StoryProfile, patch: StoryProfilePatch): StoryProfile {
  return {
    psychology: { ...base.psychology, ...(patch.psychology ?? {}) },
    speech: { ...base.speech, ...(patch.speech ?? {}) },
    dramatic: { ...base.dramatic, ...(patch.dramatic ?? {}) },
    person: { ...base.person, ...(patch.person ?? {}) },
    notes: patch.notes ?? base.notes,
  } as StoryProfile;
}

/** Ressurstypene som kan få en profil. */
export const STORY_PROFILE_KINDS = ["character", "animal"] as const;
export function canHaveStoryProfile(kind: string): boolean {
  return (STORY_PROFILE_KINDS as readonly string[]).includes(kind);
}
