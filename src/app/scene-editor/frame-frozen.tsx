/**
 * N5 (REQ-0210-rest): under avspilling tegnes sceneeditorens arbeidsflate på nytt for hvert bilde. Deler som
 * ikke avhenger av gjeldende bilde, pakkes i FrameFrozen: mens avspillingen går, gjenbrukes forrige rendring
 * så lenge alle `deps` er de samme (Object.is). Endres en avhengighet, eller avspillingen stopper, rendres
 * delen som før. Komponentenes egen tilstand oppdateres uansett (memo stopper bare rendring ovenfra).
 */
import { memo, type ReactNode } from "react";

export interface FrameFrozenProps {
  readonly children: ReactNode;
  /** Sann mens avspillingen går. */
  readonly frozen: boolean;
  /** Alt delen leser fra arbeidsflaten, unntatt gjeldende bilde og stabile tilbakekall. */
  readonly deps: readonly unknown[];
}

export function sameFrozenProps(prev: FrameFrozenProps, next: FrameFrozenProps): boolean {
  return (
    prev.frozen &&
    next.frozen &&
    prev.deps.length === next.deps.length &&
    prev.deps.every((d, i) => Object.is(d, next.deps[i]))
  );
}

export const FrameFrozen = memo(function FrameFrozen({ children }: FrameFrozenProps) {
  return <>{children}</>;
}, sameFrozenProps);
