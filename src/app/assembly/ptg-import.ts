/**
 * PTG3b (B-115): import av ferdig After Effects-film fra tittelkortets QR. Filmen leses i nettleseren;
 * har den tittelkortet (ett sekund ekstra), klippes første sekund bort med mediabunny før opplasting.
 * Regelen for klipping og lengdeavvik ligger i kjernen (decideTitleCardTrim).
 */
import type { Rational } from "@/core";
import { decideTitleCardTrim, type TitleCardDecision } from "@/core/interchange/titlecard";
import { readFilmMetadata, mimeOf } from "./film-import";

export async function prepareAeFilm(file: File, expectedFrames: number, fps: Rational): Promise<{ file: File; decision: TitleCardDecision }> {
  const meta = await readFilmMetadata(file);
  const decision = decideTitleCardTrim({ durationSeconds: meta.durationMs / 1000, expectedFrames, fps });
  if (decision.trimSeconds === 0) return { file, decision };
  const mb = await import("mediabunny");
  const mime = mimeOf(file);
  const format = mime === "video/webm" ? new mb.WebMOutputFormat() : mime === "video/quicktime" ? new mb.MovOutputFormat() : new mb.Mp4OutputFormat();
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format, target });
  const conv = await mb.Conversion.init({ input, output, trim: { start: decision.trimSeconds } });
  await conv.execute();
  const buf = target.buffer;
  if (!buf) throw new Error("trim"); // i18n-ignore: intern, erstattes av generell feilmelding
  return { file: new File([buf], file.name, { type: mime }), decision };
}
