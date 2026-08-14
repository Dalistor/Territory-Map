// The drawing loop for a territory or block outline: the ring itself, undo,
// and live feedback on whether the shape could be saved. Ported from
// `PolygonEditorController` in admin/lib/presentation/map/polygon_editor.dart
// (git history, spec 0003) -- state only, no map library. Task 11
// (`PolygonEditorLayers.tsx`) is the only file that wires this to
// Leaflet-Geoman; nothing here knows a map exists.
import { useCallback, useMemo, useReducer } from 'react'
import {
  InvalidPolygonError,
  validateRing,
  type LatLng,
  type PolygonProblem
} from '../../shared/geo'

/** Snapshots are whole rings, and a session is minutes long -- bounded so it stays cheap. */
const UNDO_LIMIT = 50

/**
 * A sentence for the admin, one per problem.
 *
 * Only called for an actual problem (the valid case never reaches it, see
 * {@link deriveState}), so there is no "no problem" branch to cover here.
 */
function hintFor(problem: PolygonProblem): string {
  switch (problem) {
    // Deliberately not phrased as an error: the shape is simply unfinished,
    // and treating every tap before the third point as a complaint would be
    // noise. Mirrors the Dart original's EditorState.hint.
    case 'tooFewPoints':
      return 'Toque no mapa para marcar ao menos 3 pontos.'
    case 'selfIntersecting':
      return 'As linhas se cruzam. Arraste um ponto para desfazer o cruzamento.'
    case 'offGlobe':
      return 'Há um ponto fora do mapa.'
  }
}

/** What the editor currently holds, and whether it could be saved. */
export interface PolygonEditorState {
  readonly points: LatLng[]
  /** Why this cannot be saved yet, or `null` when it can. */
  readonly problem: PolygonProblem | null
  readonly hint: string | null
}

function deriveState(points: LatLng[]): PolygonEditorState {
  try {
    validateRing(points)
    return { points, problem: null, hint: null }
  } catch (error) {
    if (error instanceof InvalidPolygonError) {
      return { points, problem: error.problem, hint: hintFor(error.problem) }
    }
    throw error
  }
}

interface InternalState {
  readonly points: LatLng[]
  /** Snapshots taken before each mutation, oldest first. */
  readonly undoStack: LatLng[][]
}

type Action =
  | { type: 'add'; point: LatLng }
  | { type: 'move'; index: number; point: LatLng }
  | { type: 'remove'; index: number }
  | { type: 'undo' }
  | { type: 'clear' }

function pushSnapshot(stack: LatLng[][], points: LatLng[]): LatLng[][] {
  const next = [...stack, points]
  return next.length > UNDO_LIMIT ? next.slice(next.length - UNDO_LIMIT) : next
}

function reducer(state: InternalState, action: Action): InternalState {
  switch (action.type) {
    case 'add':
      return {
        points: [...state.points, action.point],
        undoStack: pushSnapshot(state.undoStack, state.points)
      }

    case 'move': {
      if (action.index < 0 || action.index >= state.points.length) return state
      const points = [...state.points]
      points[action.index] = action.point
      return { points, undoStack: pushSnapshot(state.undoStack, state.points) }
    }

    case 'remove': {
      if (action.index < 0 || action.index >= state.points.length) return state
      return {
        points: state.points.filter((_, index) => index !== action.index),
        undoStack: pushSnapshot(state.undoStack, state.points)
      }
    }

    case 'undo': {
      if (state.undoStack.length === 0) return state
      return {
        points: state.undoStack[state.undoStack.length - 1],
        undoStack: state.undoStack.slice(0, -1)
      }
    }

    case 'clear': {
      if (state.points.length === 0) return state
      return { points: [], undoStack: pushSnapshot(state.undoStack, state.points) }
    }
  }
}

/** The public surface of {@link usePolygonEditor}. */
export interface PolygonEditor {
  readonly points: LatLng[]
  readonly state: PolygonEditorState
  readonly canUndo: boolean
  addPoint(point: LatLng): void
  movePoint(index: number, point: LatLng): void
  removePoint(index: number): void
  undo(): void
  clear(): void
}

/**
 * Drives one outline being drawn or reshaped.
 *
 * `addPoint`, `movePoint`, and `removePoint` each snapshot the ring as it was
 * *before* the mutation, which is what makes `undo` work after a drag or a
 * removal and not only after adding a point -- the same non-trivial fix the
 * Dart original needed: `PolyEditor` there exposed no hook for drag-start, so
 * without the wrapper undo would jump back past a drag to whatever the ring
 * looked like before the last *added* point, losing the move and a vertex
 * with it. Here there is no third-party mutator to work around, but the
 * snapshot-before-mutate discipline is kept identical on purpose.
 */
export function usePolygonEditor(initial: readonly LatLng[] = []): PolygonEditor {
  const [state, dispatch] = useReducer(reducer, initial, (seed): InternalState => ({
    points: [...seed],
    undoStack: []
  }))

  const addPoint = useCallback((point: LatLng) => dispatch({ type: 'add', point }), [])
  const movePoint = useCallback(
    (index: number, point: LatLng) => dispatch({ type: 'move', index, point }),
    []
  )
  const removePoint = useCallback((index: number) => dispatch({ type: 'remove', index }), [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const clear = useCallback(() => dispatch({ type: 'clear' }), [])

  const derived = useMemo(() => deriveState(state.points), [state.points])

  return {
    points: state.points,
    state: derived,
    canUndo: state.undoStack.length > 0,
    addPoint,
    movePoint,
    removePoint,
    undo,
    clear
  }
}
