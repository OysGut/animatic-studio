// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const TODO_PATH = path.resolve(__dirname, "../../docs/development/TODO_3D_PRINT.md");
const TODO = readFileSync(TODO_PATH, "utf8");

describe("TODO for 3D-print", () => {
  it("dokumenterer 3D-01 til 3D-20 med alle påkrevde felter", () => {
    for (let number = 1; number <= 20; number += 1) {
      const id = `3D-${String(number).padStart(2, "0")}`;
      const heading = new RegExp(`^### ${id} – .+$`, "m");
      const nextHeading = /^### 3D-\d{2} – /m;
      const match = heading.exec(TODO);
      expect(match, `${id} finnes`).not.toBeNull();
      const start = match!.index;
      const remainder = TODO.slice(start + match![0].length);
      const next = nextHeading.exec(remainder);
      const section = remainder.slice(0, next?.index ?? remainder.length);
      for (const field of ["Mål", "Avhengigheter", "Akseptansekriterium", "Åpne spørsmål"]) {
        expect(section, `${id} har ${field}`).toMatch(new RegExp(`^- \\*\\*${field}:\\*\\*`, "m"));
      }
    }
  });
});
