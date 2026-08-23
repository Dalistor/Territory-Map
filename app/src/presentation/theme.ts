// The app's one palette, shared by every screen. The primary blue is the
// territory-outline blue the admin already uses (`TERRITORY_OUTLINE_COLOR`
// in admin/src/renderer/map/TerritoryMap.tsx and in TerritoryMapView.tsx
// here) so the two clients read as the same product. The block status
// colors (red/orange/green) are NOT here on purpose: they belong to the
// domain (`domain/blockColor.ts` consumers) and never change with theming.
export const colors = {
  primary: '#1565c0',
  primaryPressed: '#0d47a1',
  primaryLight: '#e3f2fd',
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceSubtle: '#f1f5f9',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  textPrimary: '#0f172a',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  onPrimary: '#ffffff',
  danger: '#dc2626',
  dangerSurface: '#fef2f2',
  dangerBorder: '#fecaca',
  warningSurface: '#fffbeb',
  warningBorder: '#fde68a',
  warningText: '#92400e',
  success: '#16a34a',
  successSurface: '#f0fdf4',
  successBorder: '#bbf7d0',
  successText: '#15803d',
  disabledSurface: '#cbd5e1',
  disabledText: '#94a3b8',
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

export const shadows = {
  sm: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;
