// @vitest-environment jsdom
// B-110: «Glemt passord» sendes nå av serveren etter CAPTCHA-kontrollen. Samme svar uansett e-postadresse.
import { beforeEach, describe, expect, it, vi } from "vitest";

const fns = vi.hoisted(() => ({ sendPasswordResetCaptcha: vi.fn() }));
vi.mock("@/adapters/browser/client", () => ({ browserClient: { auth: {} } }));
vi.mock("@/adapters/auth/captcha.functions", () => ({
  captchaConfig: vi.fn(),
  requestSignupPass: vi.fn(),
  sendSignInLinkCaptcha: vi.fn(),
  signInWithPasswordCaptcha: vi.fn(),
  sendPasswordResetCaptcha: fns.sendPasswordResetCaptcha,
}));
import { CAPTCHA_ERROR, sendPasswordReset } from "@/adapters/browser/captcha-auth";

beforeEach(() => { vi.resetAllMocks(); });

describe("glemt passord", () => {
  it("returnerer identisk resultat for eksisterende og ukjent e-postadresse", async () => {
    fns.sendPasswordResetCaptcha.mockResolvedValueOnce({ ok: true });
    const existing = await sendPasswordReset("existing@example.com", "tok");
    fns.sendPasswordResetCaptcha.mockResolvedValueOnce({ ok: false, code: "auth", message: "User not found" });
    const missing = await sendPasswordReset("missing@example.com", "tok");
    expect(existing).toEqual({ error: null, session: null });
    expect(missing).toEqual(existing);
    expect(fns.sendPasswordResetCaptcha).toHaveBeenCalledWith({ data: { email: "existing@example.com", token: "tok" } });
  });

  it("skjuler også avviste forespørsler", async () => {
    fns.sendPasswordResetCaptcha.mockRejectedValueOnce(new Error("Network error"));
    await expect(sendPasswordReset("missing@example.com")).resolves.toEqual({ error: null, session: null });
  });

  it("melder bare CAPTCHA-feil tilbake", async () => {
    fns.sendPasswordResetCaptcha.mockResolvedValueOnce({ ok: false, code: "captcha-invalid" });
    await expect(sendPasswordReset("a@example.com", "bad")).resolves.toEqual({ error: { message: CAPTCHA_ERROR + "captcha-invalid" }, session: null });
  });
});
