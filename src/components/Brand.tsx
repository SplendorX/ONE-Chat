/**
 * ONE Chat brand components — inline SVG, no external file dependency.
 * Logo: speech bubble (filled gold) inside an open circle ring (gold stroke).
 *       "1" numeral and three dots are cream cutouts via mask.
 * Wordmark: logo mark + "ONEChat" rendered as DOM text so the loaded font
 *           controls kerning precisely — no SVG text, no guessed x offsets.
 */

interface LogoProps {
  size?: number;
  className?: string;
}

/** Gold speech-bubble-inside-open-ring icon. */
export function OneChatLogo({ size = 40, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="ONE Chat"
    >
      <defs>
        <mask id="logo-cut">
          {/* White = keep gold; black = cut away to reveal background */}
          <rect width="200" height="200" fill="white" />
          {/* "1" stem — tall vertical bar */}
          <rect x="77" y="70" width="15" height="56" rx="4" fill="black" />
          {/* "1" rounded top-left hook */}
          <path d="M77 80 C77 62 90 52 97 50 L97 62 C90 64 92 72 92 80 Z" fill="black" />
          {/* three dots */}
          <circle cx="116" cy="98" r="5.5" fill="black" />
          <circle cx="131" cy="98" r="5.5" fill="black" />
          <circle cx="146" cy="98" r="5.5" fill="black" />
        </mask>
      </defs>

      {/* Open circle ring — arc from ~225° to ~315°, gap at bottom-left for the tail */}
      {/* start ≈225°: (100+65·cos225, 97+65·sin225) ≈ (54, 51) */}
      {/* end   ≈315°: (100+65·cos315, 97+65·sin315) ≈ (146, 51) */}
      <path
        d="M 54 143 A 65 65 0 1 1 146 143"
        stroke="#C4A265"
        strokeWidth="16"
        strokeLinecap="round"
        fill="none"
      />

      {/* Speech bubble — fills most of the circle, tail exits bottom-left into the ring gap */}
      <path
        mask="url(#logo-cut)"
        fill="#C4A265"
        d="
          M 100 36
          C 67 36, 42 61, 42 90
          C 42 116, 59 137, 83 145
          L 54 170
          L 87 152
          C 91 153, 95 154, 100 154
          C 133 154, 158 129, 158 100
          C 158 65, 132 36, 100 36 Z
        "
      />
    </svg>
  );
}

interface WordmarkProps {
  /** Height in px — the text scales to fill this height. Default 32. */
  height?: number;
  className?: string;
}

/**
 * "ONE Chat" horizontal wordmark.
 * Uses DOM text (not SVG text) so the loaded Space Grotesk font governs kerning.
 * "ONE" in brand gold, "Chat" in oat cream — no gap, just natural word spacing.
 */
export function OneChatWordmark({ height = 32, className }: WordmarkProps) {
  const fontSize = Math.round(height * 1.1);
  return (
    <span
      className={className}
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 800,
        fontSize: `${fontSize}px`,
        letterSpacing: '-0.03em',
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'baseline',
        userSelect: 'none',
      }}
    >
      <span style={{ color: '#C4A265' }}>ONE</span>
      <span style={{ color: '#EDE5D8' }}>&nbsp;Chat</span>
    </span>
  );
}
