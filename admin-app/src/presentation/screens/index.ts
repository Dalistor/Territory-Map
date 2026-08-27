// SetupScreen, DesignationsScreen, AssignmentPanel and BlocksScreen land here
// (spec 0012, tasks 07, 10, 11 and 12).
export * from './BlocksScreen';
// The combined block panel and the work section both callers share (spec 0013,
// Task 05).
export { default as BlockPanel, TERRITORY_SCOPE_NOTE } from './BlockPanel';
export type { BlockPanelApi, BlockPanelProps, BlockPanelSession } from './BlockPanel';
export { BlockWorkSection } from './BlockWorkSection';
export type { BlockWorkSectionApi, BlockWorkSectionSession } from './BlockWorkSection';
export { default as DesignationsScreen, NO_TERRITORIES_MESSAGE } from './DesignationsScreen';
export type {
  DesignationsScreenApi,
  DesignationsScreenProps,
  DesignationsScreenSession,
} from './DesignationsScreen';
export { default as SetupScreen } from './SetupScreen';
export type { SetupScreenProps } from './SetupScreen';
