import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { isRTL } from '../lib/i18n';

/** Stroke icons in the brand's style (1.8px, round caps). `back`/`forward` follow the reading direction. */
export type IconName =
  | 'back' | 'forward' | 'close' | 'plus' | 'send' | 'stop' | 'settings' | 'inbox' | 'laptop' | 'lock' | 'chat'
  | 'shield' | 'shieldCheck' | 'qr' | 'clipboard' | 'flash' | 'wrench' | 'check' | 'chevDown' | 'chevUp' | 'compose'
  | 'reply' | 'clock' | 'calendar' | 'bell' | 'image' | 'people' | 'copy' | 'trash' | 'alert'
  | 'play' | 'info' | 'share' | 'x';

export function Icon({ name, size = 22, color, strokeWidth = 1.8, fill }: { name: IconName; size?: number; color: string; strokeWidth?: number; fill?: string }) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  let body: React.ReactNode;
  switch (name) {
    case 'back': body = <Path {...p} d={isRTL ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />; break;
    case 'forward': body = <Path {...p} d={isRTL ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />; break;
    case 'close': body = <><Path {...p} d="M6 6l12 12" /><Path {...p} d="M18 6L6 18" /></>; break;
    case 'plus': body = <><Path {...p} d="M12 5v14" /><Path {...p} d="M5 12h14" /></>; break;
    case 'send': body = <><Path {...p} d="M12 19V5" /><Path {...p} d="M6 11l6-6 6 6" /></>; break;
    case 'stop': body = <Rect x={5} y={5} width={14} height={14} rx={3} fill={color} />; break;
    case 'settings':
      body = <><Line {...p} x1={4} y1={7} x2={20} y2={7} /><Line {...p} x1={4} y1={17} x2={20} y2={17} />
        <Circle {...p} cx={9} cy={7} r={2.6} fill={fill ?? 'none'} /><Circle {...p} cx={15} cy={17} r={2.6} fill={fill ?? 'none'} /></>;
      break;
    case 'inbox': body = <><Path {...p} d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z" /><Path {...p} d="M4 13h4.5a3.5 3.5 0 0 0 7 0H20" /></>; break;
    case 'laptop': body = <><Rect {...p} x={4} y={5} width={16} height={11} rx={2} /><Line {...p} x1={2} y1={19.5} x2={22} y2={19.5} /></>; break;
    case 'lock': body = <><Rect {...p} x={5} y={11} width={14} height={9} rx={2} /><Path {...p} d="M8 11V8a4 4 0 0 1 8 0v3" /></>; break;
    case 'chat': body = <Path {...p} d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7l-4 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />; break;
    case 'shield': body = <><Path {...p} d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z" /><Path {...p} d="M12 8v5" /><Path {...p} d="M12 16.5v.01" /></>; break;
    case 'shieldCheck': body = <><Path {...p} d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z" /><Path {...p} d="M9 12l2 2 4-4" /></>; break;
    case 'qr': body = <><Path {...p} d="M4 8V6a2 2 0 0 1 2-2h2" /><Path {...p} d="M16 4h2a2 2 0 0 1 2 2v2" /><Path {...p} d="M20 16v2a2 2 0 0 1-2 2h-2" /><Path {...p} d="M8 20H6a2 2 0 0 1-2-2v-2" /><Rect {...p} x={9} y={9} width={6} height={6} rx={1} /></>; break;
    case 'clipboard': body = <><Rect {...p} x={6} y={5} width={12} height={16} rx={2} /><Path {...p} d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /></>; break;
    case 'flash': body = <Path {...p} d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" />; break;
    case 'wrench': body = <Path {...p} d="M14.5 6.5a4 4 0 0 0-5 5L4 17v3h3l5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-2.5 2.5-2.5z" />; break;
    case 'check': body = <Path {...p} d="M5 12.5l4.5 4.5L19 7.5" />; break;
    case 'chevDown': body = <Path {...p} d="M6 9l6 6 6-6" />; break;
    case 'chevUp': body = <Path {...p} d="M6 15l6-6 6 6" />; break;
    case 'compose': body = <><Path {...p} d="M12 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /><Path {...p} d="M17.5 4.5l2 2L12 14l-3 1 1-3 7.5-7.5z" /></>; break;
    case 'reply': body = <><Path {...p} d={isRTL ? 'M14 7l5 5-5 5' : 'M10 7l-5 5 5 5'} /><Path {...p} d={isRTL ? 'M19 12h-9a5 5 0 0 0-5 5v1' : 'M5 12h9a5 5 0 0 1 5 5v1'} /></>; break;
    case 'clock': body = <><Circle {...p} cx={12} cy={12} r={8.5} /><Path {...p} d="M12 7.5V12l3 2" /></>; break;
    case 'calendar': body = <><Rect {...p} x={4} y={5.5} width={16} height={14.5} rx={3} /><Path {...p} d="M4 10h16" /><Path {...p} d="M8.5 3.5v4" /><Path {...p} d="M15.5 3.5v4" /></>; break;
    case 'bell': body = <><Path {...p} d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z" /><Path {...p} d="M10 21h4" /></>; break;
    case 'image': body = <><Rect {...p} x={3.5} y={5} width={17} height={14} rx={3} /><Circle {...p} cx={9} cy={10} r={1.6} /><Path {...p} d="M5 17l5-4 3 2.5 3-3 4 4" /></>; break;
    case 'people': body = <><Circle {...p} cx={9} cy={9} r={3.2} /><Path {...p} d="M3.5 19a5.5 5.5 0 0 1 11 0" /><Path {...p} d="M16 6.2a3 3 0 0 1 0 5.6" /><Path {...p} d="M17.5 14.2A5 5 0 0 1 20.5 19" /></>; break;
    case 'copy': body = <><Rect {...p} x={8} y={8} width={11} height={12} rx={2} /><Path {...p} d="M5 15V6a2 2 0 0 1 2-2h8" /></>; break;
    case 'trash': body = <><Path {...p} d="M4 7h16" /><Path {...p} d="M9 7V4h6v3" /><Path {...p} d="M6 7l1 13h10l1-13" /></>; break;
    case 'play': body = <Path {...p} d="M8 5.5v13l11-6.5-11-6.5z" />; break;
    case 'info': body = <><Circle {...p} cx={12} cy={12} r={8.5} /><Path {...p} d="M12 11v5" /><Path {...p} d="M12 8v.01" /></>; break;
    case 'share': body = <><Path {...p} d="M12 15V4" /><Path {...p} d="M7.5 8L12 3.5 16.5 8" /><Path {...p} d="M6 12v7h12v-7" /></>; break;
    case 'x': body = <><Path {...p} d="M6 6l12 12" /><Path {...p} d="M18 6L6 18" /></>; break;
    case 'alert': body = <><Path {...p} d="M12 3L2 20h20L12 3z" /><Path {...p} d="M12 10v4" /><Path {...p} d="M12 17v.01" /></>; break;
  }
  return <Svg width={size} height={size} viewBox="0 0 24 24">{body}</Svg>;
}
