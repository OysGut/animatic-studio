// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "@/core";

const storage = vi.hoisted(() => ({ upload: vi.fn(), from: vi.fn() }));
vi.mock("@/adapters/browser/client", () => ({
  browserClient: { storage: { from: storage.from } }, db: {},
}));
import { uploadToSignedPath } from "@/adapters/browser/global-library";

afterEach(() => { vi.resetAllMocks(); setLanguage("nb"); });

describe("GP2 signert filopplasting", () => {
  const file = new Blob(["image"], { type: "image/png" });
  const upload = () => {
    storage.from.mockReturnValue({ uploadToSignedUrl: storage.upload });
    return uploadToSignedPath("global/group/asset/image.png", "signed-token", file);
  };

  it("godtar Storage sitt JSON-svar", async () => {
    storage.upload.mockResolvedValue({ data: { path: "global/group/asset/image.png", fullPath: "assets/global/group/asset/image.png" }, error: null });
    await expect(upload()).resolves.toBeUndefined();
    expect(storage.from).toHaveBeenCalledWith("assets");
    expect(storage.upload).toHaveBeenCalledWith("global/group/asset/image.png", "signed-token", file, { contentType: "image/png", upsert: true });
  });

  it.each(["nb", "en"] as const)("skjuler JSON-feil ved SVG/HTML-svar (%s)", async (lang) => {
    setLanguage(lang);
    storage.upload.mockRejectedValue(new SyntaxError('Unexpected token \'<\', "<svg xmlns" is not valid JSON'));
    await expect(upload()).rejects.toThrow(lang === "nb" ? "Opplastingen av filen feilet. Prøv igjen." : "The file upload failed. Please try again.");
  });

  it("skjuler feil returnert av Storage", async () => {
    storage.upload.mockResolvedValue({ data: null, error: { message: "Internal storage error" } });
    await expect(upload()).rejects.toThrow("Opplastingen av filen feilet. Prøv igjen.");
  });

  it("avviser svar uten bekreftet filsti", async () => {
    storage.upload.mockResolvedValue({ data: {}, error: null });
    await expect(upload()).rejects.toThrow("Opplastingen av filen feilet. Prøv igjen.");
  });
});