/**
 * «Tilbake» til vinduet brukeren kom fra (DEC-0063, REQ-0587): en global knapp i toppstripen som går
 * tilbake til forrige arbeidsflate (manus, bibliotek, sceneeditor, montering …) med samme valg som da
 * brukeren forlot den (scene, ressurs, replikk i adressen). Bytte av valg inne i samme flate gir ikke
 * nye steg. Historikken huskes for fanen (sessionStorage) og overlever at siden lastes på nytt.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { pageLabel, recordVisit, type Entry } from "./back-stack";

const KEY = "animatic:back-stack";

function load(): Entry[] {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter(
          (e): e is Entry =>
            !!e &&
            typeof e.path === "string" &&
            typeof e.href === "string" &&
            e.href.startsWith("/"),
        )
      : [];
  } catch {
    return [];
  }
}

let stack: Entry[] = typeof window === "undefined" ? [] : load();
let goingBack = false;
const EMPTY: Entry[] = [];
const listeners = new Set<() => void>();

function save() {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(stack));
  } catch {
    // Privat modus o.l.: historikken gjelder bare til siden lastes på nytt
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Følger navigasjonen. Brukes én gang, høyt i appen (rotruten). */
export function useTrackNavigation() {
  const loc = useRouterState({ select: (s) => s.location });
  const href = loc.href;
  const path = loc.pathname;
  useEffect(() => {
    stack = recordVisit(stack, path, href, goingBack);
    goingBack = false;
    save();
  }, [path, href]);
}

/** Knappen «Tilbake til …» (vises bare når det finnes en flate å gå tilbake til). */
export function BackButton() {
  const navigate = useNavigate();
  // På serveren (og under hydrering) finnes ingen historikk: knappen vises først i nettleseren
  const list = useSyncExternalStore(
    subscribe,
    () => stack,
    () => EMPTY,
  );
  const prev = list.at(-2);
  if (!prev) return null;
  const label = pageLabel(prev.path);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        goingBack = true;
        void navigate({ href: prev.href });
      }}
      title={`Tilbake til ${label}`}
      aria-label={`Tilbake til ${label}`}
      className="-ml-2"
    >
      <ArrowLeft />
      <span className="hidden md:inline">{label}</span>
    </Button>
  );
}
