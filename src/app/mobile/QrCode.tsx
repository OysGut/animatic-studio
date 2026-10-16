/** QR-kode for en lenke (tegnes i nettleseren; ingen tjeneste utenfor appen ser lenken). */
import { useEffect, useState } from "react";
import { L } from "@/core";

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import("qrcode").then((m) =>
      m
        .toDataURL(value, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: size * 2,
          color: { dark: "#000000", light: "#ffffff" },
        })
        .then((url) => {
          if (alive) setSrc(url);
        }),
    );
    return () => {
      alive = false;
    };
  }, [value, size]);
  return src ? (
    <img
      src={src}
      width={size}
      height={size}
      alt={L("QR-kode – skann med kameraet på mobilen", "QR code – scan with your phone's camera")}
      data-testid="mobile-qr"
      className="rounded-sm bg-white"
    />
  ) : (
    <div
      style={{ width: size, height: size }}
      className="animate-pulse rounded-sm bg-surface-3"
      aria-label={L("Lager QR-koden …", "Making the QR code …")}
      data-testid="mobile-qr-loading"
    />
  );
}
