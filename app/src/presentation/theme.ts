// The app's one palette, shared by every screen: the mobile version of the
// tokens in the root `DESIGN.md` (spec 0018, Task 02), so the publisher app
// reads as the same product as the two admins. Key names are kept from the
// pre-DESIGN.md theme so the screens did not have to be rewritten; the values
// are DESIGN.md's, and every text pair below reaches WCAG AA (4.5:1) on the
// surface it is used on.
//
// The block status colors (red/orange/green) are NOT here on purpose: they
// belong to the domain (`domain/blockColor.ts` consumers) and never change
// with theming. Only the ink drawn *over* them is a theme concern
// (`mapLabelInk`).
export const colors = {
  primary: '#155FC0', // DESIGN.md primary
  primaryPressed: '#124F9F', // primary-strong
  primaryLight: '#EAF1FF', // primary-soft -- textSecondary does not reach AA here; use primary ink
  background: '#F8FAFC', // canvas-mobile
  surface: '#FFFFFF',
  surfaceSubtle: '#F8FAFC', // surface-subtle: textSecondary on it = 4.83:1
  border: '#DCE4ED',
  /** Edge of an input or control: 3.47:1 on white, the non-text AA floor. */
  borderInput: '#7B8BA1',
  textPrimary: '#10233F',
  textSecondary: '#5A6B83', // 5.43:1 on white, 4.79:1 on primarySoft
  /** Placeholders carry words, so they get the secondary tier, never a lighter grey. */
  textPlaceholder: '#5A6B83',
  onPrimary: '#FFFFFF',
  focus: '#1769D1',
  danger: '#C63D37', // 4.63:1 on dangerSurface
  dangerSurface: '#FFF1F0',
  dangerBorder: '#F2C4C0',
  warningSurface: '#FFF8E8',
  warningBorder: '#F0D9A8',
  warningText: '#955B0E', // warning-ink, 5.25:1 on warningSurface
  success: '#25834A',
  successSurface: '#EEFAF1',
  successBorder: '#BFE3CB',
  successText: '#1F7642', // success-ink, 5.25:1 on successSurface
  disabledSurface: '#E7ECF2',
  disabledText: '#5A6B83',
  /** Veil behind a modal. */
  scrim: 'rgba(16, 35, 63, 0.5)',
  /** Controls floating over the map (legend, labels, attribution). */
  mapOverlay: 'rgba(255, 255, 255, 0.94)',
  /** Dark ink over a block's domain colour where white would fall under AA (the overdue orange). */
  mapLabelInk: '#10233F',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

/** Controls 8, panels 12, chips full; `sheet` only for the top corners of a bottom sheet. */
export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  sheet: 16,
  full: 9999,
} as const;

/** DESIGN.md's mobile type scale. Nothing under 12, except the map's own labels (11). */
export const fontSize = {
  mapLabel: 11,
  small: 12,
  meta: 13,
  body: 15,
  section: 16,
  title: 20,
} as const;

/** Minimum touch target (44 dp) and the comfortable height of a primary button (48 dp). */
export const touchTarget = {
  min: 44,
  comfortable: 48,
} as const;

/**
 * Shadows are for what floats (the card over the map, a modal). Resting
 * cards and buttons stay flat with a 1 px border.
 */
export const shadows = {
  sm: {
    shadowColor: '#10233F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#10233F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
} as const;
