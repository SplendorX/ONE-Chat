/**
 * ONE Chat brand assets — inline SVG, no external files, no font dependency.
 *
 * Logo:     Large standalone mark — circle ring (open bottom-left) + speech bubble
 *           with "1" numeral and three dots as cream negative space.
 *
 * Wordmark: The speech-bubble mark used as the "O" glyph, followed by "NE" in gold
 *           then "Chat" in cream — all tight, no extra gap.
 */

interface LogoProps {
  size?: number;
  className?: string;
}

/** Standalone mark: open circle ring + speech bubble with 1 + dots. */
export function OneChatLogo({ size = 40, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Cream cutouts: 1 numeral + three dots */}
        <mask id="logo-cut">
          <rect width="200" height="200" fill="white" />
          {/* "1" serif — rounded top-left flag, vertical stem */}
          {/* Top flag curving left */}
          <path d="M 88 52 C 78 55 70 62 68 72 L 80 75 C 81 69 85 65 90 63 Z" fill="black" />
          {/* Vertical stem */}
          <rect x="83" y="62" width="14" height="60" rx="4" fill="black" />
          {/* Three dots horizontally centered in right half */}
          <circle cx="117" cy="100" r="6" fill="black" />
          <circle cx="133" cy="100" r="6" fill="black" />
          <circle cx="149" cy="100" r="6" fill="black" />
        </mask>
      </defs>

      {/* Open ring: arc from ~225° to ~315° (gap at bottom-left where tail exits) */}
      {/* 225°: (100+68*cos225, 100+68*sin225) ≈ (52, 148) */}
      {/* 315°: (100+68*cos315, 100+68*sin315) ≈ (148, 52) */}
      <path
        d="M 52 148 A 68 68 0 1 1 148 52"
        stroke="#C4A265"
        strokeWidth="16"
        strokeLinecap="round"
        fill="none"
      />

      {/* Speech bubble — fills interior, tail exits bottom-left through ring gap */}
      <path
        d="M 100 36
           C 65 36, 40 62, 40 92
           C 40 118, 57 139, 82 147
           L 52 172
           L 86 153
           C 90 154, 95 155, 100 155
           C 135 155, 160 129, 160 99
           C 160 64, 134 36, 100 36 Z"
        fill="#C4A265"
        mask="url(#logo-cut)"
      />
    </svg>
  );
}

interface WordmarkProps {
  height?: number;
  className?: string;
}

/**
 * Full wordmark: speech-bubble "O" + "NE" in gold + "Chat" in cream.
 * The icon is sized to cap-height of the text so it sits on the baseline.
 */
export function OneChatWordmark({ height = 32, className }: WordmarkProps) {
  // The viewBox is 520 wide × 100 tall; scale by height/100
  const w = Math.round(height * 5.2);
  return (
    <svg
      width={w}
      height={height}
      viewBox="0 0 520 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <mask id="wm-cut">
          <rect width="100" height="100" fill="white" />
          {/* Three dots inside the O bubble */}
          <circle cx="38" cy="50" r="4.5" fill="black" />
          <circle cx="50" cy="50" r="4.5" fill="black" />
          <circle cx="62" cy="50" r="4.5" fill="black" />
        </mask>
      </defs>

      {/* ---- The "O": speech bubble icon scaled to ~90px tall, sitting on baseline ---- */}
      {/* Open ring arc for the O */}
      <path
        d="M 18 76 A 38 38 0 1 1 80 18"
        stroke="#C4A265"
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
      />
      {/* Bubble body with tail */}
      <path
        d="M 48 12
           C 28 12, 12 28, 12 48
           C 12 64, 22 77, 37 82
           L 18 98
           L 40 86
           C 43 87, 45 87, 48 87
           C 68 87, 84 71, 84 51
           C 84 29, 68 12, 48 12 Z"
        fill="#C4A265"
        mask="url(#wm-cut)"
      />

      {/* ---- "NE" in gold, tight after the O ---- */}
      <text
        x="90"
        y="82"
        fontFamily="'Space Grotesk', 'Arial Black', sans-serif"
        fontSize="80"
        fontWeight="800"
        fill="#C4A265"
        letterSpacing="-2"
      >NE</text>

      {/* ---- "Chat" in cream, tight after NE ---- */}
      {/* NE at 80px ≈ 2 chars × ~46px = ~92px wide; 90 + 92 = 182 */}
      <text
        x="182"
        y="82"
        fontFamily="'Space Grotesk', 'Arial Black', sans-serif"
        fontSize="80"
        fontWeight="800"
        fill="#EDE5D8"
        letterSpacing="-2"
      >Chat</text>
    </svg>
  );
}
