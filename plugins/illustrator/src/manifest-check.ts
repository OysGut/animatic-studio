/**
 * C-7: kontroll av CEP-manifestet (CSXS/manifest.xml) før pakking og i testene: Illustrator (ILST) 27+, CSXS 11+,
 * ett panel, hovedfil og ExtendScript-fil, uten Node (--enable-nodejs / --mixed-context).
 */
export function checkIllustratorManifest(xml: string): string[] {
  const issues: string[] = [];
  const host = /<Host\s+Name="ILST"\s+Version="\[(\d+)(?:\.\d+)?,/.exec(xml);
  if (!host || Number(host[1]) < 27) issues.push("host");
  const csxs = /<RequiredRuntime\s+Name="CSXS"\s+Version="(\d+)/.exec(xml);
  if (!csxs || Number(csxs[1]) < 11) issues.push("csxs");
  if (!/<MainPath>\.\/index\.html<\/MainPath>/.test(xml)) issues.push("main");
  if (!/<ScriptPath>\.\/jsx\/host\.jsx<\/ScriptPath>/.test(xml)) issues.push("script");
  if (!/<Type>Panel<\/Type>/.test(xml)) issues.push("panel");
  if (/--enable-nodejs|--mixed-context/.test(xml)) issues.push("node");
  if (!/ExtensionBundleId="com\.pentoglass\.illustrator"/.test(xml)) issues.push("bundle");
  return issues;
}
