// Maps a Google maneuver code to a MaterialIcons glyph name.
// MaterialIcons ships Google's own turn-by-turn nav icon set (real bent-road
// arrows matching each turn's actual severity) — already bundled inside
// @expo/vector-icons, so this needs no new dependency or native rebuild.
// Shared by DriverLiveMap's on-road turn badges and VoiceNavBar's icon so
// both always agree on what a given turn looks like.
//
// `text` is the spoken instruction for the same step. It is only consulted for
// roundabouts — see below — but it is worth passing everywhere so that stays
// true if more of these ever need it.
export function maneuverIcon(maneuver?: string, text?: string): string {
  const m = (maneuver || '').toLowerCase();

  /* ROUNDABOUTS: the LEFT/RIGHT in Google's code is NOT the way you leave.
     ROUNDABOUT_LEFT means the circle is driven left-hand — which is every
     roundabout in India, whether you exit left, right or carry straight on.
     MaterialIcons' roundabout-left / roundabout-right glyphs mean the opposite
     thing: they draw the EXIT. Mapping one onto the other put a "leave to the
     left" arrow on screen next to "At Gol Market Chowraha, continue straight",
     which is how a correct instruction ended up with a wrong arrow.
     Verified against the live Routes API: every roundabout on three Lucknow
     routes came back ROUNDABOUT_LEFT, including ones whose own text says to
     continue straight.
     So the exit is read from the instruction instead, and when the instruction
     does not say, the arrow says nothing rather than something wrong. */
  if (m.startsWith('roundabout')) {
    const t = (text || '').toLowerCase();
    if (t.includes('left'))  return 'roundabout-left';
    if (t.includes('right')) return 'roundabout-right';
    return 'straight';
  }

  switch (m) {
    case 'turn-slight-left':  return 'turn-slight-left';
    case 'turn-slight-right': return 'turn-slight-right';
    case 'turn-sharp-left':   return 'turn-sharp-left';
    case 'turn-sharp-right':  return 'turn-sharp-right';
    case 'turn-left':         return 'turn-left';
    case 'turn-right':        return 'turn-right';
    case 'uturn-left':        return 'u-turn-left';
    case 'uturn-right':       return 'u-turn-right';
    case 'fork-left':
    case 'ramp-left':
    case 'keep-left':         return 'fork-left';
    case 'fork-right':
    case 'ramp-right':
    case 'keep-right':        return 'fork-right';
    case 'merge':             return 'merge';
    // Straight ahead, said three different ways. Listed rather than left to
    // the default so it is clear these were considered and are correct —
    // the default exists for codes nobody has seen yet.
    case 'depart':
    case 'name-change':
    case 'straight':          return 'straight';
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
  // Same rule as above: at a roundabout the useful thing is which way you
  // leave it, and that is only ever in the words.
  if (t.includes('roundabout') || t.includes('circle')) {
    if (t.includes('left'))  return 'roundabout-left';
    if (t.includes('right')) return 'roundabout-right';
    return 'straight';
  }
  if (t.includes('left'))  return 'turn-left';
  if (t.includes('right')) return 'turn-right';
  return 'straight';
}
