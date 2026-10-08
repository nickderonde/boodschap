// Eenvoudige lijn-iconen met react-native-svg (geen extra dependency).
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'check' | 'sync' | 'offline' | 'partial' | 'warning' | 'device' | 'plus' | 'share' | 'gear' | 'chevron'
  | 'back' | 'trash' | 'more' | 'scan' | 'paste' | 'close' | 'circle' | 'circle-check' | 'list' | 'copy';

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color: string }) {
  const p = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === 'check' && <Path d="M5 12.5l4.5 4.5L19 7.5" {...p} />}
      {name === 'sync' && (
        <>
          <Path d="M20 11a8 8 0 0 0-14.5-4.5M4 4v4h4" {...p} />
          <Path d="M4 13a8 8 0 0 0 14.5 4.5M20 20v-4h-4" {...p} />
        </>
      )}
      {name === 'offline' && (
        <>
          <Path d="M3 3l18 18" {...p} />
          <Path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.5M19 13a10 10 0 0 0-2-1.6M2 9.5a15 15 0 0 1 5-3M22 9.5a15 15 0 0 0-9.5-3.9" {...p} />
          <Circle cx="12" cy="20" r="0.8" fill={color} stroke={color} />
        </>
      )}
      {name === 'partial' && (
        <>
          <Path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0" {...p} />
          <Circle cx="12" cy="20" r="0.8" fill={color} stroke={color} />
        </>
      )}
      {name === 'warning' && (
        <>
          <Path d="M12 3l10 18H2L12 3z" {...p} />
          <Path d="M12 10v5M12 18v.5" {...p} />
        </>
      )}
      {name === 'device' && (
        <>
          <Rect x="7" y="2.5" width="10" height="19" rx="2" {...p} />
          <Path d="M11 18.5h2" {...p} />
        </>
      )}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...p} />}
      {name === 'share' && (
        <>
          <Path d="M12 15V3M7.5 7.5L12 3l4.5 4.5" {...p} />
          <Path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" {...p} />
        </>
      )}
      {name === 'gear' && (
        <>
          <Circle cx="12" cy="12" r="3" {...p} />
          <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" {...p} strokeWidth={1.6} />
        </>
      )}
      {name === 'chevron' && <Path d="M9 5l7 7-7 7" {...p} />}
      {name === 'back' && <Path d="M15 5l-7 7 7 7" {...p} />}
      {name === 'trash' && <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" {...p} />}
      {name === 'more' && (
        <>
          <Circle cx="5" cy="12" r="1.3" fill={color} stroke={color} />
          <Circle cx="12" cy="12" r="1.3" fill={color} stroke={color} />
          <Circle cx="19" cy="12" r="1.3" fill={color} stroke={color} />
        </>
      )}
      {name === 'scan' && <Path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" {...p} />}
      {name === 'paste' && (
        <>
          <Rect x="6" y="4" width="12" height="17" rx="2" {...p} />
          <Path d="M9 4V3h6v1M9 10h6M9 14h6" {...p} />
        </>
      )}
      {name === 'copy' && (
        <>
          <Rect x="8" y="8" width="12" height="12" rx="2" {...p} />
          <Path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" {...p} />
        </>
      )}
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...p} />}
      {name === 'circle' && <Circle cx="12" cy="12" r="9" {...p} />}
      {name === 'circle-check' && (
        <>
          <Circle cx="12" cy="12" r="9.5" fill={color} stroke={color} />
          <Path d="M7.5 12.5l3 3 6-6.5" stroke="#FFFFFF" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {name === 'list' && <Path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" {...p} />}
    </Svg>
  );
}
