import { useRef } from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

/** Standalone mark: open circle ring + speech bubble with 1 + dots. */
export function OneChatLogo({ size = 40, className }: LogoProps) {
  // Stable unique mask ID per instance — avoids SVG mask clashes when rendered multiple times
  const idRef = useRef(`lc-${Math.random().toString(36).slice(2, 7)}`);
  const id = idRef.current;
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
        <mask id={id}>
          <rect width="200" height="200" fill="white" />
          {/* "1" numeral — top flag + vertical stem */}
          <path d="M 88 52 C 78 55 70 62 68 72 L 80 75 C 81 69 85 65 90 63 Z" fill="black" />
          <rect x="83" y="62" width="14" height="60" rx="4" fill="black" />
          {/* Three dots */}
          <circle cx="117" cy="100" r="6" fill="black" />
          <circle cx="133" cy="100" r="6" fill="black" />
          <circle cx="149" cy="100" r="6" fill="black" />
        </mask>
      </defs>
      {/* Open ring arc — gap at bottom-left */}
      <path
        d="M 52 148 A 68 68 0 1 1 148 52"
        stroke="#C4A265"
        strokeWidth="16"
        strokeLinecap="round"
        fill="none"
      />
      {/* Speech bubble with cutouts */}
      <path
        d="M 100 36 C 65 36, 40 62, 40 92 C 40 118, 57 139, 82 147 L 52 172 L 86 153 C 90 154, 95 155, 100 155 C 135 155, 160 129, 160 99 C 160 64, 134 36, 100 36 Z"
        fill="#C4A265"
        mask={`url(#${id})`}
      />
    </svg>
  );
}

interface WordmarkProps {
  height?: number;
  className?: string;
}

/** Full wordmark: "ONE" in brand gold + "Chat" in --ink. */
export function OneChatWordmark({ height = 32, className }: WordmarkProps) {
  const fontSize = Math.round(height * 0.9);
  const style: React.CSSProperties = {
    fontFamily: "'Space Grotesk', 'Arial Black', sans-serif",
    fontSize,
    fontWeight: 800,
    letterSpacing: '-0.04em',
    lineHeight: 1,
  };
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 0, lineHeight: 1, userSelect: 'none' }}
    >
      <span style={{ ...style, color: '#C4A265' }}>ONE</span>
      <span style={{ ...style, color: 'var(--ink)', marginLeft: Math.round(height * 0.12) }}>Chat</span>
    </span>
  );
}
