import { describe, expect, it } from "vitest";
import { fdxToFountain } from "@/core/screenplay/fdx";
import { parseFountain } from "@/core/screenplay";
import { scriptLanguageHint } from "@/core/screenplay/import-language";

const FDX = `<?xml version="1.0"?><FinalDraft DocumentType="Script"><Content>
<Paragraph Type="Scene Heading"><Text>INT. 台所 - 夜</Text></Paragraph>
<Paragraph Type="Action"><Text>ユキが座っている。</Text></Paragraph>
<Paragraph Type="Character"><Text>ユキ</Text></Paragraph>
<Paragraph Type="Parenthetical"><Text>(小声で)</Text></Paragraph>
<Paragraph Type="Dialogue"><Text>こんばんは &amp; ようこそ。</Text></Paragraph>
</Content></FinalDraft>`;

describe("G-1b FDX-import", () => {
  it("avsnittene blir scene, handling, karakter og replikk", () => {
    const { parsed } = parseFountain(fdxToFountain(FDX));
    const kinds = parsed.scenes.flatMap((s) => s.elements.map((e) => e.kind));
    expect(kinds).toEqual(expect.arrayContaining(["action", "character", "dialogue"]));
    expect(fdxToFountain(FDX)).toContain("こんばんは & ようこそ。");
  });
  it("japansk tekst gir språkforslag ja", () => {
    expect(scriptLanguageHint(fdxToFountain(FDX))).toBe("ja");
  });
  it("ikke-FDX avvises", () => {
    expect(() => fdxToFountain("<html/>")).toThrow();
  });
});
