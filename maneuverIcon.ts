// Maps a Google Directions API maneuver code to a MaterialIcons glyph name.
// MaterialIcons ships Google's own turn-by-turn nav icon set (real bent-road
// arrows matching each turn's actual severity) — already bundled inside
// @expo/vector-icons, so this needs no new dependency or native rebuild.
// Shared by DriverLiveMap's on-road turn badges and VoiceNavBar's icon so
// both always agree on what a given turn looks like.
export function maneuverIcon(maneuver?: string): string {
  switch ((maneuver || '').toLowerCase()) {
    case 'turn-slight-left':  return 'turn-slight-left';
    case 'turn-slight-right': return 'turn-slight-right';
    case 'turn-sharp-left':   return 'turn-sharp-left';
    case 'turn-sharp-right':  return 'turn-sharp-right';
    case 'turn-left':         return 'turn-left';
    case 'turn-right':        return 'turn-right';
    case 'uturn-left':        return 'u-turn-left';
    case 'uturn-right':       return 'u-turn-right';
    case 'roundabout-left':   return 'roundabout-left';
    case 'roundabout-right':  return 'roundabout-right';
    case 'fork-left':
    case 'ramp-left':
    case 'keep-left':         return 'fork-left';
    case 'fork-right':
    case 'ramp-right':
    case 'keep-right':        return 'fork-right';
    case 'merge':              return 'merge';
    default:                  return 'straight';
  }
}

// Fallback for callers that only have the spoken/text instruction (no raw
// maneuver code available) — coarser, but still uses real bent-arrow glyphs
// instead of a generic straight arrow.
export function maneuverIconFromText(text?: string): string {
  const t = (text || '').toLowerCase();
  if (t.includes('sharp left'))   return 'turn-sharp-left';
  if (t.includes('sharp right'))  return 'turn-sharp-right';
  if (t.includes('slight left'))  return 'turn-slight-left';
  if (t.includes('slight right')) return 'turn-slight-right';
  if (t.includes('u-turn') || t.includes('u turn')) return 'u-turn-left';
  if (t.includes('roundabout') || t.includes('circle')) return 'roundabout-right';
  if (t.includes('left'))  return 'turn-left';
  if (t.includes('right')) return 'turn-right';
  return 'straight';
}
