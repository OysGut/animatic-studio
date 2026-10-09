/** Nedlasting av filer laget i nettleseren (eksport). Virker i Safari fordi filen lages i samme klikk. */

export interface ReadyFile {
  readonly url: string;
  readonly name: string;
}

/** Lager fillenke og prøver å starte nedlastingen. Lenken beholdes så brukeren kan klikke selv. */
export function prepareDownload(bytes: Uint8Array, name: string, type: string): ReadyFile {
  const url = URL.createObjectURL(new Blob([bytes as unknown as ArrayBuffer], { type }));
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    // Nedlasting blokkert (f.eks. i en innebygd forhåndsvisning) – lenken i dialogen brukes i stedet
  }
  return { url, name };
}

/** Kjører appen inne i en annen side (f.eks. Lovables forhåndsvisning)? Da kan nedlastinger være blokkert. */
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
