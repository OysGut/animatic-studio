/**
 * Ø-11 (SECURITY_REVIEW_2026-10): inndata til tekst-AI har faste maksgrenser, og timegrensen per bruker er 120.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_TEXT_JOBS_PER_USER_PER_HOUR,
  MAX_TEXT_MESSAGES,
  MAX_TEXT_SYSTEM_CHARS,
  MAX_TEXT_TOTAL_CHARS,
  validateTextInput,
} from "@/adapters/ai/text.functions";

const base = {
  projectId: "01900000-0000-7000-8000-000000000001",
  task: "general",
  messages: [{ role: "user", content: "Hei" }],
  maxTokens: 100,
};

describe("Ø-11: tekst-AI-inndata", () => {
  it("godtar en vanlig forespørsel", () => {
    expect(validateTextInput(base).projectId).toBe(base.projectId);
  });
  it("avviser for lang systeminstruks", () => {
    expect(() => validateTextInput({ ...base, system: "x".repeat(MAX_TEXT_SYSTEM_CHARS + 1) })).toThrow();
  });
  it("avviser for mange meldinger", () => {
    const messages = Array.from({ length: MAX_TEXT_MESSAGES + 1 }, () => ({ role: "user", content: "a" }));
    expect(() => validateTextInput({ ...base, messages })).toThrow();
  });
  it("avviser for mye tekst totalt", () => {
    const messages = [{ role: "user", content: "x".repeat(MAX_TEXT_TOTAL_CHARS + 1) }];
    expect(() => validateTextInput({ ...base, messages })).toThrow();
  });
  it("avviser ugyldig prosjekt-ID og svarlengde over taket", () => {
    expect(() => validateTextInput({ ...base, projectId: "x" })).toThrow();
    expect(() => validateTextInput({ ...base, maxTokens: 8001 })).toThrow();
  });
  it("timegrensen per bruker er 120 kall", () => {
    expect(MAX_TEXT_JOBS_PER_USER_PER_HOUR).toBe(120);
  });
});
