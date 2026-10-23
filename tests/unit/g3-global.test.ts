import { describe, expect, it } from "vitest";
import {
  countGraphemes,
  countWords,
  speechRateFor,
  speechSeconds,
} from "@/core/language/text-metrics";
import { parseFountain } from "@/core/fountain-shim";
