// ═══════════════════════════════════════════════════════════════════════════════
// SPPERO DRIVER — Design System Tokens
// Phase 01: centralized brand colors, typography, spacing, radius, shadows.
// Usage: import { C, T, SP, R, SHADOW } from './theme'
// ═══════════════════════════════════════════════════════════════════════════════

// ── Color Tokens ──────────────────────────────────────────────────────────────
export const C = {
  // Brand (shared with customer app — one Sppero identity)
  pink:    '#FF2D78',
  plum:    '#2E1461',
  saffron: '#FF7A00',
  green:   '#059669',
  red:     '#EF4444',

  // Driver-specific states
  online:  '#00C853',   // Big green online toggle
  offline: '#94A3B8',   // Greyed out offline state
  earning: '#059669',   // Earnings / commission positive
  warn:    '#F59E0B',   // Warnings, approaching limits

  // Backgrounds — lavender-tinted (premium, not generic white)
  bg:      '#F5F2FF',
  bgCard:  '#FFFFFF',
  bgDeep:  '#EAE5FF',
  bgDark:  '#1A0D2E',   // Driver-specific: dark mode ride request overlay

  // Glass tokens
  glass:       '#FFFFFF',
  glassMid:    '#F3F0FE',
  glassHigh:   '#E8E3FC',
  glassBorder: '#E2DCFF',

  // Tinted fills
  pinkGlass:   'rgba(255,45,120,0.07)',
  pinkBorder:  'rgba(255,45,120,0.22)',
  greenGlass:  'rgba(0,200,83,0.08)',
  greenBorder: 'rgba(0,200,83,0.25)',
  saffGlass:   'rgba(255,122,0,0.07)',
  saffBorder:  'rgba(255,122,0,0.22)',
  redGlass:    'rgba(239,68,68,0.07)',
  redBorder:   'rgba(239,68,68,0.22)',
  plumGlass:   'rgba(46,20,97,0.06)',
  plumBorder:  'rgba(46,20,97,0.18)',

  // Text
  text:      '#1A0D2E',
  textMuted: '#6B6B8D',
  textDim:   '#9B94B8',
  textWhite: '#FFFFFF',
  textWhiteDim: 'rgba(255,255,255,0.55)',
};

// ── Typography Scale ──────────────────────────────────────────────────────────
export const T = {
  // Earnings hero number
  earnings: { fontSize: 48, fontWeight: '900' as const, letterSpacing: -2.0, lineHeight: 54 },
  display:  { fontSize: 36, fontWeight: '900' as const, letterSpacing: -1.5, lineHeight: 42 },
  headline: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.5, lineHeight: 28 },
  title:    { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.2, lineHeight: 24 },
  body:     { fontSize: 14, fontWeight: '400' as const, lineHeight: 22 },
  bodyBold: { fontSize: 14, fontWeight: '700' as const, lineHeight: 22 },
  caption:  { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.3, lineHeight: 16 },
  label:    { fontSize: 10, fontWeight: '800' as const, letterSpacing: 1.5, lineHeight: 14 },
  fare:     { fontSize: 28, fontWeight: '900' as const, letterSpacing: -1.0, lineHeight: 34 },
};

// ── Spacing (8-point grid) ────────────────────────────────────────────────────
export const SP = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

// ── Border Radius ─────────────────────────────────────────────────────────────
export const R = {
  xs:   8,
  sm:   14,
  md:   20,
  lg:   28,
  xl:   36,
  full: 100,
};

// ── Shadow System ─────────────────────────────────────────────────────────────
export const SHADOW = {
  sm: {
    elevation: 3,
    shadowColor: '#2E1461',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  md: {
    elevation: 6,
    shadowColor: '#2E1461',
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  lg: {
    elevation: 14,
    shadowColor: '#2E1461',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  pink: {
    elevation: 8,
    shadowColor: '#FF2D78',
    shadowOpacity: 0.38,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  green: {
    elevation: 8,
    shadowColor: '#00C853',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
};

// ── Driver-specific component presets ─────────────────────────────────────────
// Ready-to-spread style objects for common driver UI patterns.
export const DS = {
  // Online toggle track — the big on/off button
  onlineTrack: {
    width: 72,
    height: 40,
    borderRadius: R.full,
    justifyContent: 'center' as const,
    paddingHorizontal: 4,
  },
  onlineThumb: {
    width: 32,
    height: 32,
    borderRadius: R.full,
    backgroundColor: '#FFFFFF',
    ...SHADOW.md,
  },
  // Ride request card — dark overlay
  rideRequestCard: {
    backgroundColor: C.bgDark,
    borderRadius: R.lg,
    padding: SP.lg,
    ...SHADOW.lg,
  },
  // Countdown ring container
  countdownWrap: {
    width: 80,
    height: 80,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  // Earnings strip — stat tile
  earnTile: {
    flex: 1,
    backgroundColor: C.bgCard,
    borderRadius: R.md,
    padding: SP.md,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: C.glassBorder,
    ...SHADOW.sm,
  },
  // Commission progress bar track
  commTrack: {
    height: 8,
    backgroundColor: C.glassMid,
    borderRadius: R.full,
    overflow: 'hidden' as const,
  },
  commFill: {
    height: 8,
    backgroundColor: C.saffron,
    borderRadius: R.full,
  },
};
