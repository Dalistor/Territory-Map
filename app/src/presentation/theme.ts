// The app's one palette, shared by every screen. The primary blue is the
// territory-outline blue the admin already uses (`TERRITORY_OUTLINE_COLOR`
// in admin/src/renderer/map/TerritoryMap.tsx and in TerritoryMapView.tsx
// here) so the two clients read as the same product. The block status
// colors (red/orange/green) are NOT here on purpose: they belong to the
// domain (`domain/blockColor.ts` consumers) and never change with theming.
export const colors = {
  primary: '#1565c0',
  primaryPressed: '#0d47a1',
  background: '#f5f7fa',
  surface: '#ffffff',
  border: '#d5dbe1',
  textPrimary: '#1c2733',
  textSecondary: '#5a6672',
  onPrimary: '#ffffff',
  danger: '#c62828',
  dangerSurface: '#fdecea',
  warningSurface: '#fff3cd',
  warningText: '#856404',
  disabledSurface: '#b0bec5',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
