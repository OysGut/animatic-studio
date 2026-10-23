/**
 * Felles miniatyrbilde (plassholderretting del 2): viser alltid hele bildet med egne proporsjoner
 * (object-contain, sentrert) over et nøytralt sjakkmønster for alfa. Aldri beskjæring eller strekking.
 */
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type ThumbnailProps = Omit<ComponentProps<"img">, "className" | "style"> & {
  className?: string;
  /** Sjakkmønster bak bildet (standard: på). */
  checker?: boolean;
};

export function Thumbnail({ className, checker = true, alt = "", ...rest }: ThumbnailProps) {
  return (
    <img
      {...rest}
      alt={alt}
      data-thumbnail="contain"
      className={cn("size-full object-contain object-center", checker && "thumb-checker", className)}
    />
  );
}
