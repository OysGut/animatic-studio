/**
 * G-9: «Åpne eksempelprosjektet». Lager et vanlig, eget prosjekt (kan slettes fritt) og skriver innholdet
 * med de vanlige kommandoene via runCommand → apply_changes. Språket er grensesnittspråket når eksempelet
 * finnes på det, ellers engelsk.
 */
import { FPS_25, locale, type ProductionId } from "@/core";
import { demoProjectName, pickDemoLanguage, planDemoProject } from "@/core/demo/plan";
import { createProjectWithFps, findMainProductions } from "@/adapters/browser/projects";
import { runCommand } from "@/adapters/storage/commands.functions";

export async function createDemoProject(uiLocale: string = locale()): Promise<string> {
  const lang = pickDemoLanguage(uiLocale);
  const created = await createProjectWithFps(demoProjectName(lang), FPS_25.num, FPS_25.den, lang);
  if (created.error) throw new Error(created.error.message);
  const projectId = created.data as string;
  const main = await findMainProductions(projectId);
  const productionId = main.data?.[0]?.id;
  if (main.error || !productionId) throw new Error(main.error?.message ?? "main production missing"); // i18n-ignore – teknisk feil
  const commands = planDemoProject({
    productionId: productionId as ProductionId,
    language: lang,
    fps: FPS_25,
    width: 1920,
    height: 1080,
  });
  for (const command of commands) {
    const res = await runCommand({ data: { projectId, command } });
    if (!res.ok) throw new Error(res.message);
  }
  return projectId;
}
