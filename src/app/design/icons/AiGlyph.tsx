/**
 * AI-generering (DESIGN_SYSTEM §6): egen nøytral glyf i Lucide-rutenettet (24-grid, strek 1,5), ikke «gnister»
 * eller tryllestav. En ramme (bildet) med en liten prosessor-node: «lages av en maskin», uten løfter om magi.
 * Brukes som et Lucide-ikon (arver størrelse og farge fra knappen).
 */
import { forwardRef, type SVGProps } from "react";

export const AiGlyph = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(function AiGlyph(
  { className, ...props },
  ref,
) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={"lucide" + (className ? ` ${className}` : "")}
      {...props}
    >
      <rect x="3" y="5" width="13" height="14" rx="1.5" />
      <rect x="11" y="10" width="10" height="9" rx="1.5" />
      <path d="M14 14.5h4M19 7v1.5M21 8.5h-1.5" />
      <path d="M7 9h4M7 12h2" />
    </svg>
  );
});
