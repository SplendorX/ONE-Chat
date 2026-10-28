/**
 * AllieIcon — animated orb for ALLIE AI.
 * A pulsing golden orb with a soft rotating inner ring and three orbiting dots.
 * Pure CSS animations — no extra dependencies.
 */

import { useEffect, useRef } from 'react';

interface AllieIconProps {
  size?: number;
  /** 'idle' = gentle pulse | 'thinking' = faster spin | 'speaking' = wave */
  state?: 'idle' | 'thinking' | 'speaking';
  className?: string;
}

/* Inject keyframes once into the document head */
const KEYFRAMES = `
@keyframes allie-pulse {
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.08); opacity: 1; }
}
@keyframes allie-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes allie-spin-rev {
  from { transform: rotate(0deg); }
  to { transform: rotate(-360deg); }
}
@keyframes allie-orbit {
  from { transform: rotate(0deg) translateX(var(--r)) rotate(0deg); }
  to   { transform: rotate(360deg) translateX(var(--r)) rotate(-360deg); }
}
@keyframes allie-wave {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(1.6); }
}
@keyframes allie-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(196,162,101,0); }
  50% { box-shadow: 0 0 12px 4px rgba(196,162,101,0.35); }
}
`;

let injected = false;
function injectKeyframes() {
  if (injected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
  injected = true;
}

export function AllieIcon({ size = 32, state = 'idle', className }: AllieIconProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { injectKeyframes(); }, []);

  const isThinking = state === 'thinking';
  const isSpeaking = state === 'speaking';

  const outerSize = size;
  const innerSize = Math.round(size * 0.58);
  const ringSize = Math.round(size * 0.82);
  const dotSize = Math.max(2, Math.round(size * 0.1));
  const orbitR = Math.round(size * 0.28);

  const spinDuration = isThinking ? '0.9s' : '3.5s';
  const pulseDuration = isSpeaking ? '0.6s' : '2.4s';

  return (
    <div
      ref={ref}
      className={className}
      style={{
        width: outerSize,
        height: outerSize,
        borderRadius: '50%',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #C4A265 0%, #8B6F3E 100%)',
        animation: `allie-pulse ${pulseDuration} ease-in-out infinite, allie-glow ${pulseDuration} ease-in-out infinite`,
        flexShrink: 0,
      }}
    >
      {/* Rotating ring */}
      <div style={{
        position: 'absolute',
        width: ringSize,
        height: ringSize,
        borderRadius: '50%',
        border: `${Math.max(1, Math.round(size * 0.04))}px solid rgba(255,255,255,0.3)`,
        borderTopColor: 'rgba(255,255,255,0.7)',
        animation: `allie-spin ${spinDuration} linear infinite`,
      }} />

      {/* Counter-rotating inner ring */}
      <div style={{
        position: 'absolute',
        width: Math.round(ringSize * 0.72),
        height: Math.round(ringSize * 0.72),
        borderRadius: '50%',
        border: `${Math.max(1, Math.round(size * 0.03))}px solid rgba(255,255,255,0.15)`,
        borderBottomColor: 'rgba(255,255,255,0.5)',
        animation: `allie-spin-rev ${isThinking ? '1.4s' : '5s'} linear infinite`,
      }} />

      {/* Inner core glow */}
      <div style={{
        width: innerSize,
        height: innerSize,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 38% 38%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.05) 70%)',
        zIndex: 1,
      }} />

      {/* Orbiting dots */}
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          position: 'absolute',
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.85)',
          // @ts-expect-error css custom property
          '--r': `${orbitR}px`,
          transformOrigin: '50% 50%',
          animation: `allie-orbit ${isThinking ? '1.2s' : '3s'} linear infinite`,
          animationDelay: `${i * (isThinking ? 0.4 : 1)}s`,
        }} />
      ))}

      {/* Speaking mode: small equalizer bars */}
      {isSpeaking && (
        <div style={{
          position: 'absolute',
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          zIndex: 2,
        }}>
          {[0.5, 0.9, 0.6, 1, 0.7].map((h, i) => (
            <div key={i} style={{
              width: Math.max(2, Math.round(size * 0.06)),
              height: Math.round(size * 0.28 * h),
              borderRadius: 2,
              background: 'rgba(255,255,255,0.85)',
              animation: `allie-wave 0.6s ease-in-out infinite`,
              animationDelay: `${i * 0.1}s`,
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
