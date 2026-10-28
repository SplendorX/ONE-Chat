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
 * Full wordmark: small speech-bubble icon + "ONE" in gold + "Chat" in --ink.
 * DOM-based so CSS variables work for theme-adaptive colours.
 */
export function OneChatWordmark({ height = 32, className }: WordmarkProps) {
  const iconSize = Math.round(height * 0.85);
  const fontSize = Math.round(height * 0.9);
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.round(height * 0.08),
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {/* Speech bubble icon — the "O" */}
      <OneChatLogo size={iconSize} />
      {/* "NE" in brand gold */}
      <span style={{
        fontFamily: "'Space Grotesk', 'Arial Black', sans-serif",
        fontSize,
        fontWeight: 800,
        color: '#C4A265',
        letterSpacing: '-0.04em',
        lineHeight: 1,
        marginLeft: -Math.round(height * 0.05),
      }}>NE</span>
      {/* "Chat" in --ink so it adapts to both themes */}
      <span style={{
        fontFamily: "'Space Grotesk', 'Arial Black', sans-serif",
        fontSize,
        fontWeight: 800,
        color: 'var(--ink)',
        letterSpacing: '-0.04em',
        lineHeight: 1,
        marginLeft: Math.round(height * 0.12),
      }}>Chat</span>
    </span>
  );
}
