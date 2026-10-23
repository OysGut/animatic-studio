/**
 * G-1b: Final Draft (.fdx) → Fountain-tekst. FDX er åpen XML; avsnittene (Paragraph Type=…) gjøres om til
 * tvungne Fountain-elementer, slik at den vanlige Fountain-tolkeren lager manuset. Ren TypeScript uten DOM.
 * Ukjente avsnittstyper blir handling – ingen tekst forsvinner.
 */

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

export interface FdxParagraph {
  readonly type: string;
  readonly text: string;
}

/** Avsnittene i <Content> (tittelside og andre seksjoner hoppes over). */
export function fdxParagraphs(xml: string): FdxParagraph[] {
  if (!/<FinalDraft\b/.test(xml)) throw new Error("not fdx"); // i18n-ignore – intern feil, oversettes av kalleren
  const content = /<Content\b[^>]*>([\s\S]*?)<\/Content>/.exec(xml)?.[1] ?? "";
  const out: FdxParagraph[] = [];
  for (const m of content.matchAll(/<Paragraph\b([^>]*)>([\s\S]*?)<\/Paragraph>/g)) {
    const type = /\bType="([^"]*)"/.exec(m[1] ?? "")?.[1] ?? "Action";
    const text = [...(m[2] ?? "").matchAll(/<Text\b[^>]*>([\s\S]*?)<\/Text>/g)]
      .map((x) => decodeXml(x[1] ?? ""))
      .join("")
      .replace(/\r\n?/g, "\n")
      .trim();
    if (text) out.push({ type, text });
  }
  return out;
}

/** Gjør FDX-avsnitt om til Fountain med tvungne markeringer (., @, !, >). */
export function fdxToFountain(xml: string): string {
  const parts: string[] = [];
  let inDialogue = false;
  for (const p of fdxParagraphs(xml)) {
    const one = p.text.replace(/\n+/g, " ");
    switch (p.type) {
      case "Scene Heading":
        parts.push("", `.${one}`);
        inDialogue = false;
        break;
      case "Character":
        parts.push("", `@${one}`);
        inDialogue = true;
        break;
      case "Parenthetical":
        if (inDialogue) parts.push(one.startsWith("(") ? one : `(${one})`);
        else parts.push("", `!${one}`);
        break;
      case "Dialogue":
        if (inDialogue) parts.push(p.text);
        else parts.push("", `!${p.text}`);
        break;
      case "Transition":
        parts.push("", `> ${one}`);
        inDialogue = false;
        break;
      default:
        parts.push("", ...p.text.split("\n").map((l) => `!${l}`));
        inDialogue = false;
    }
  }
  return parts.join("\n").trim() + "\n";
}
