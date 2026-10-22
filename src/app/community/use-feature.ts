/**
 * B-114 C0: om en Community-funksjon er tilgjengelig for den innloggede brukeren. Bare for å skjule menyer;
 * standard er av (også mens svaret lastes og ved feil). Håndhevingen skjer i databasen.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchMyFeatures } from "@/adapters/browser/features";
import type { FeatureKey } from "@/core/community";

export const MY_FEATURES_KEY = ["my-features"] as const;

export function useFeature(key: FeatureKey): boolean {
  const q = useQuery({ queryKey: MY_FEATURES_KEY, queryFn: fetchMyFeatures, staleTime: 60_000 });
  return q.data?.[key] === true;
}
