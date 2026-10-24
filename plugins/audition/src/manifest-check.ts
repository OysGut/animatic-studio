/**
 * C-6: kontroll av CEP-manifestet (CSXS/manifest.xml) før pakking og i testene. Bare tekstsjekker: Audition
 * (AUDT) 24+, CSXS 11+, ett panel, hovedfil og ExtendScript-fil. Node (--enable-nodejs) er ikke slått på, så
 * panelet ikke får filsystem eller prosesser utover CEP-ens egne API-er.
 */
export function checkAuditionManifest(xml: string): string[] {
  const issues: string[] = [];
  const host = /<Host\s+Name="AUDT"\s+Version="\[(\d+)(?:\.\d+)?,/.exec(xml);
  if (!host || Number(host[1]) < 24) issues.push("host");
  const csxs = /<RequiredRuntime\s+Name="CSXS"\s+Version="(\d+)/.exec(xml);
  if (!csxs || Number(csxs[1]) < 11) issues.push("csxs");
  if (!/<MainPath>\.\/index\.html<\/MainPath>/.test(xml)) issues.push("main");
  if (!/<ScriptPath>\.\/jsx\/host\.jsx<\/ScriptPath>/.test(xml)) issues.push("script");
  if (!/<Type>Panel<\/Type>/.test(xml)) issues.push("panel");
  if (/--enable-nodejs|--mixed-context/.test(xml)) issues.push("node");
  if (!/ExtensionBundleId="com\.pentoglass\.audition"/.test(xml)) issues.push("bundle");
  return issues;
}
