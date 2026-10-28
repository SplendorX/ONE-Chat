/**
 * Brand assets for ONE Chat.
 * Logo: speech-bubble-circle icon in brand gold.
 * Wordmark: logo "O" + "NE Chat" lockup.
 * Use these everywhere instead of text placeholders.
 */

interface LogoProps {
  /** Icon size in px — square. Default 40. */
  size?: number;
  className?: string;
}

/** Standalone speech-bubble-circle icon mark. */
export function OneChatLogo({ size = 40, className }: LogoProps) {
  return (
    <img
      src="/logo.svg"
      alt="ONE Chat"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block' }}
    />
  );
}

interface WordmarkProps {
  /** Height of the wordmark in px. Width scales proportionally (ratio ~4.33:1). Default 32. */
  height?: number;
  className?: string;
}

/** Full "ONE Chat" horizontal wordmark. */
export function OneChatWordmark({ height = 32, className }: WordmarkProps) {
  // SVG viewBox is 520×120 → ratio 4.333
  const width = Math.round(height * (520 / 120));
  return (
    <img
      src="/wordmark.svg"
      alt="ONE Chat"
      width={width}
      height={height}
      className={className}
      style={{ display: 'block' }}
    />
  );
}
