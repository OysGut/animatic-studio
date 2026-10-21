// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn() }));
vi.mock("@/adapters/browser/client", () => ({ browserClient: { auth } }));
import { sendPasswordReset } from "@/adapters/browser/auth";

beforeEach(() => { vi.resetAllMocks(); });

describe("glemt passord", () => {
  it("returnerer identisk resultat for eksisterende og ukjent e-postadresse", async () => {
    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const existing = await sendPasswordReset("existing@example.com");
    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { message: "User not found" } });
    const missing = await sendPasswordReset("missing@example.com");
    expect(existing).toEqual({ error: null, session: null });
    expect(missing).toEqual(existing);
    for (const [email] of auth.resetPasswordForEmail.mock.calls) {
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(email, {
        redirectTo: window.location.origin + "/tilbakestill-passord",
      });
    }
  });

  it("skjuler også avviste forespørsler", async () => {
    auth.resetPasswordForEmail.mockRejectedValueOnce(new Error("Network error"));
    await expect(sendPasswordReset("missing@example.com")).resolves.toEqual({ error: null, session: null });
  });
});
