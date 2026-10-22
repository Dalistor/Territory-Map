// The admin app's one palette: the values of `DESIGN.md` (colors, "Contrast
// rules" and "Mobile (Android)", spec 0018) under the names this app's
// screens already use. Only the border tints of the status surfaces and the
// disabled pair are local; DESIGN.md names no value for them.
//
// The block status colors (red/orange/green) are NOT here on purpose -- they
// belong to the domain (`domain/blockColor.ts` consumers) and never change
// with theming.
export const colors = {
  primary: '#155FC0',
  primaryPressed: '#124F9F',
  primaryLight: '#EAF1FF',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSubtle: '#F8FAFC',
  border: '#DCE4ED',
  borderStrong: '#B8C6D6',
  /** Outline of an input or a secondary control: 3.47:1 against white. */
  borderInput: '#7B8BA1',
  focus: '#1769D1',
  textPrimary: '#10233F',
  /** 5.05:1 on white; never used on `primaryLight`, where it falls under AA. */
  textSecondary: '#5A6B83',
  /** `text-placeholder` in DESIGN.md: the same ink as `textSecondary`. */
  textPlaceholder: '#5A6B83',
  /**
   * `text-tertiary`: non-text only (chevrons, decorative dots). Text uses
   * `textSecondary`, the lightest ink that still passes AA.
   */
  textMuted: '#7B8AA0',
  onPrimary: '#FFFFFF',
  danger: '#C63D37',
  /** Error text and destructive labels on `dangerSurface`: 5.91:1. */
  dangerText: '#B91C1C',
  dangerSurface: '#FFF1F0',
  dangerBorder: '#F5C2BF',
  warning: '#AA6812',
  warningSurface: '#FFF8E8',
  warningBorder: '#F1D79B',
  warningText: '#955B0E',
  success: '#25834A',
  successSurface: '#EEFAF1',
  successBorder: '#B9E2C6',
  successText: '#1F7642',
  disabledSurface: '#E8EDF3',
  disabledText: '#5A6B83',
  /** Behind a modal. */
  scrim: 'rgba(16, 35, 63, 0.5)',
  /** Controls and labels drawn over the map. */
  mapOverlay: 'rgba(255, 255, 255, 0.94)',
  /** Ink of text over the map, and of the number on the overdue block. */
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

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

/** 44 dp is the floor (`UX-CONTRACT.md`); 48 dp is what a button gets by default. */
export const touchTarget = {
  min: 44,
  default: 48,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#10233F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#10233F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  lg: {
    shadowColor: '#10233F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;
