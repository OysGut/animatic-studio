/** DEC-0091: teknisk feilmelding på feilsiden – kopierbar, uten mobiltoken eller spørrestreng. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ErrorDetails } from "@/app/shell/ErrorDetails";
import { errorReport, safePagePath } from "@/app/shell/error-report";

describe("teknisk feilmelding", () => {
  it("adressen tas med uten mobiltoken, spørrestreng og fragment", () => {
    expect(safePagePath("https://a.app/m/abcDEF_123-xyz?x=1#y")).toBe("/m/…");
    expect(safePagePath("https://a.app/prosjekt/p1/scene?token=hemmelig")).toBe(
      "/prosjekt/p1/scene",
    );
  });

  it("viser tid, side, feiltype, melding og de første stakklinjene", () => {
    const e = new TypeError("x is undefined");
    e.stack = [
      "TypeError: x is undefined",
      ...Array.from({ length: 20 }, (_, i) => `    at f${i} (a.js:${i})`),
    ].join("\n");
    const r = errorReport(e, "https://a.app/m/hemmeligtoken", new Date("2026-10-16T10:00:00Z"));
    const lines = r.split("\n");
    expect(lines[0]).toBe("2026-10-16T10:00:00.000Z");
    expect(lines[1]).toBe("/m/…");
    expect(lines[2]).toBe("TypeError: x is undefined");
    expect(lines.slice(3)).toHaveLength(8);
    expect(r).not.toContain("hemmeligtoken");
  });

  it("tåler feil som ikke er Error-objekter", () => {
    expect(errorReport("noe", "/", new Date(0)).split("\n")[2]).toBe("string: noe");
  });
});

describe("feilsiden", () => {
  it("«Vis teknisk feilmelding» viser meldingen og kan kopiere den", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ErrorDetails error={new Error("Krasj i sceneeditoren")} />);
    expect(screen.getByText("Vis teknisk feilmelding")).toBeTruthy();
    expect(screen.getByLabelText("Teknisk feilmelding").textContent).toContain(
      "Error: Krasj i sceneeditoren",
    );
    fireEvent.click(screen.getByText("Kopier feilmeldingen"));
    await waitFor(() => expect(screen.getByText("Kopiert")).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Krasj i sceneeditoren"));
  });
});
