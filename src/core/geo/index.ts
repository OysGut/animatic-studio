/**
 * B-117: byer per land fra GeoNames cities15000 (CC BY 4.0, https://www.geonames.org/). Komprimert utvalg:
 * de 25 største byene per land pluss hovedstaden. Samme utvalg ligger i private.globe_places (0085).
 * Dataene lastes bare ved behov (dynamisk import av cities.json).
 */
export type CityRow = readonly [id: number, name: string, lat: number, lon: number];

export interface CityData {
  readonly cities: Readonly<Record<string, readonly CityRow[]>>;
  readonly capitals: Readonly<Record<string, number>>;
}

export async function loadCities(): Promise<CityData> {
  return (await import("./cities.json")).default as unknown as CityData;
}

export function citiesOf(data: CityData, country: string | null): readonly CityRow[] {
  return country ? data.cities[country] ?? [] : [];
}

export function capitalOf(data: CityData, country: string): CityRow | null {
  const id = data.capitals[country];
  return citiesOf(data, country).find((c) => c[0] === id) ?? null;
}
