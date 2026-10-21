/**
 * DEC-0091 / KI-237: «cannot add `postgres_changes` callbacks … after `subscribe()`» i sceneeditoren. Supabase
 * gir tilbake samme kanal når navnet er i bruk; to lyttere på samme prosjekt (mobilimporten i prosjektet og i
 * sceneeditoren) krasjet derfor siden. Falsk klient som oppfører seg som Supabase på dette punktet.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const channels = new Map<string, { subscribed: boolean }>();
  const make = (topic: string) => {
    const state = channels.get(topic) ?? { subscribed: false };
    channels.set(topic, state);
    const ch = {
      topic,
      on: () => {
        if (state.subscribed)
          throw new Error(
            `cannot add \`postgres_changes\` callbacks for ${topic} after \`subscribe()\`.`,
          );
        return ch;
      },
      subscribe: () => {
        state.subscribed = true;
        return ch;
      },
    };
    return ch;
  };
  return {
    channels,
    client: {
      channel: (name: string) => make(`realtime:${name}`),
      removeChannel: (ch: { topic: string }) => {
        channels.delete(ch.topic);
        return Promise.resolve("ok");
      },
    },
  };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: h.client }));
// R7: statisk import. Den dynamiske importen inne i testen lastet hele adaptertreet under testens
// tidsgrense og fikk tidsavbrudd når full vitest kjørte mange filer samtidig. Nå lastes modulene før
// testene starter, og hver test begynner med tomt kanalregister.
import { subscribeMobileImports } from "@/adapters/browser/mobile-import";
import { subscribeProjectChanges } from "@/adapters/browser/project-data";

beforeEach(() => h.channels.clear());

describe("sanntidskanaler", () => {
  it("to lyttere på mobilimporten i samme prosjekt krasjer ikke", () => {
    const a = subscribeMobileImports("p1", () => {});
    const b = subscribeMobileImports("p1", () => {});
    expect(h.channels.size).toBe(2);
    a();
    // Montert på nytt før den gamle kanalen er borte (StrictMode, bytte av side)
    const c = subscribeMobileImports("p1", () => {});
    b();
    c();
    expect(h.channels.size).toBe(0);
  });

  it("to lyttere på prosjektendringene krasjer ikke", () => {
    const a = subscribeProjectChanges("p1", () => {});
    const b = subscribeProjectChanges("p1", () => {});
    a();
    b();
    expect(h.channels.size).toBe(0);
  });
});
