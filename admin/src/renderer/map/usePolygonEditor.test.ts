// The drawing loop, ported from admin/lib/presentation/map/polygon_editor.dart
// (`PolygonEditorController`) without any dependency on a map library: this
// hook only owns state (the ring, the undo stack, and the validity
// feedback). The Leaflet/Leaflet-Geoman wiring is Task 11
// (`PolygonEditorLayers.tsx`), the only file allowed to import that library.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as geo from '../../shared/geo'
import type { LatLng } from '../../shared/geo'
import { usePolygonEditor } from './usePolygonEditor'

const a: LatLng = { lat: 0, lng: 0 }
const b: LatLng = { lat: 0, lng: 1 }
const c: LatLng = { lat: 1, lng: 1 }
const d: LatLng = { lat: 1, lng: 0 }

/** A counter-clockwise unit square, built one point at a time. */
function renderSquare(): ReturnType<typeof renderHook<ReturnType<typeof usePolygonEditor>, void>> {
  const view = renderHook(() => usePolygonEditor())
  act(() => {
    view.result.current.addPoint(a)
    view.result.current.addPoint(b)
    view.result.current.addPoint(c)
    view.result.current.addPoint(d)
  })
  return view
}

describe('usePolygonEditor', () => {
  it('starts empty and unsavable', () => {
    const { result } = renderHook(() => usePolygonEditor())

    expect(result.current.points).toEqual([])
    expect(result.current.state.problem).toBe('tooFewPoints')
    expect(result.current.canUndo).toBe(false)
  })

  it('opens on an existing ring without anything to undo', () => {
    const initial: LatLng[] = [a, b, c]
    const { result } = renderHook(() => usePolygonEditor(initial))

    expect(result.current.points).toEqual([a, b, c])
    expect(result.current.state.problem).toBeNull()
    expect(result.current.canUndo).toBe(false)
  })

  it('becomes valid at the third point', () => {
    const { result } = renderHook(() => usePolygonEditor())

    act(() => {
      result.current.addPoint(a)
      result.current.addPoint(b)
    })
    expect(result.current.state.problem).toBe('tooFewPoints')

    act(() => result.current.addPoint(c))

    expect(result.current.state.problem).toBeNull()
  })

  it('hands back points in the order they were added', () => {
    const { result } = renderSquare()

    expect(result.current.points).toEqual([a, b, c, d])
  })

  it('treats an unfinished shape as a neutral hint, not an alarming error', () => {
    const { result } = renderHook(() => usePolygonEditor())

    act(() => result.current.addPoint(a))

    expect(result.current.state.problem).toBe('tooFewPoints')
    expect(result.current.state.hint).toMatch(/3 pontos/)
    // Neutral wording: an instruction, not a complaint about a "problem" or "error".
    expect(result.current.state.hint?.toLowerCase()).not.toMatch(/erro|inválid/)
  })

  it('names a self-intersecting outline and how to fix it', () => {
    const { result } = renderHook(() => usePolygonEditor())

    // A bow tie: the diagonals cross.
    act(() => {
      result.current.addPoint(a)
      result.current.addPoint(c)
      result.current.addPoint(b)
      result.current.addPoint(d)
    })

    expect(result.current.state.problem).toBe('selfIntersecting')
    expect(result.current.state.hint).toMatch(/cruzam/)
  })

  it('names a point off the globe', () => {
    const { result } = renderHook(() => usePolygonEditor())

    act(() => {
      result.current.addPoint(a)
      result.current.addPoint(b)
      result.current.addPoint({ lat: 200, lng: 0 })
    })

    expect(result.current.state.problem).toBe('offGlobe')
    expect(result.current.state.hint).toBeTruthy()
  })

  it('has no hint once the shape is valid', () => {
    const { result } = renderSquare()

    expect(result.current.state.hint).toBeNull()
  })

  describe('undo', () => {
    it('does nothing on an untouched editor', () => {
      const { result } = renderHook(() => usePolygonEditor())

      act(() => result.current.undo())

      expect(result.current.points).toEqual([])
      expect(result.current.canUndo).toBe(false)
    })

    it('removes the last added point', () => {
      const { result } = renderSquare()

      act(() => result.current.undo())

      expect(result.current.points).toEqual([a, b, c])
    })

    it('walks all the way back to empty', () => {
      const { result } = renderSquare()

      // Four points were added, so four snapshots exist. `result.current` only
      // reflects the latest render, which does not happen mid-batch inside a
      // single `act()` -- so this drives a known number of undos rather than
      // looping on `canUndo`, which would never observe the change and spin
      // forever.
      act(() => {
        result.current.undo()
        result.current.undo()
        result.current.undo()
        result.current.undo()
      })

      expect(result.current.points).toEqual([])
      expect(result.current.canUndo).toBe(false)
    })

    it('is undoable after removePoint, restoring the removed point', () => {
      const { result } = renderSquare()

      act(() => result.current.removePoint(0))
      expect(result.current.points).toEqual([b, c, d])

      act(() => result.current.undo())

      expect(result.current.points).toEqual([a, b, c, d])
    })

    it('is undoable after movePoint, restoring the point before the drag', () => {
      // This is the non-trivial case the Dart original documented: without a
      // snapshot taken before the drag itself (not only before "add"), undo
      // would jump back past the drag to whatever the ring looked like before
      // the last *added* point -- losing the move and a vertex with it.
      const { result } = renderSquare()

      act(() => result.current.movePoint(0, { lat: 5, lng: 5 }))
      expect(result.current.points).toEqual([{ lat: 5, lng: 5 }, b, c, d])

      act(() => result.current.undo())

      expect(result.current.points).toEqual([a, b, c, d])
    })

    it('is undoable after clear, restoring the whole ring', () => {
      const { result } = renderSquare()

      act(() => result.current.clear())
      expect(result.current.points).toEqual([])

      act(() => result.current.undo())

      expect(result.current.points).toEqual([a, b, c, d])
    })

    it('clearing an already-empty editor pushes no undo step', () => {
      const { result } = renderHook(() => usePolygonEditor())

      act(() => result.current.clear())

      expect(result.current.canUndo).toBe(false)
    })

    it('is true exactly when there is at least one snapshot', () => {
      const { result } = renderHook(() => usePolygonEditor())
      expect(result.current.canUndo).toBe(false)

      act(() => result.current.addPoint(a))
      expect(result.current.canUndo).toBe(true)

      act(() => result.current.undo())
      expect(result.current.canUndo).toBe(false)
    })

    it('caps the snapshot stack at 50 entries, discarding the oldest', () => {
      const { result } = renderHook(() => usePolygonEditor())

      act(() => {
        // 60 mutations means 60 snapshots would be taken without the cap.
        for (let i = 0; i < 60; i++) {
          result.current.addPoint({ lat: i, lng: i })
        }
      })

      act(() => {
        for (let i = 0; i < 50; i++) {
          result.current.undo()
        }
      })

      // With the cap at 50, the 10 oldest snapshots (taken before points
      // 0..9 were added) were discarded, so undo cannot walk past point 10.
      expect(result.current.points).toEqual(
        Array.from({ length: 10 }, (_, i) => ({ lat: i, lng: i }))
      )
      expect(result.current.canUndo).toBe(false)
    })
  })

  describe('movePoint', () => {
    it('replaces the point at the given index', () => {
      const { result } = renderSquare()

      act(() => result.current.movePoint(2, { lat: 9, lng: 9 }))

      expect(result.current.points).toEqual([a, b, { lat: 9, lng: 9 }, d])
    })

    it('is a no-op for an out-of-range index, and takes no snapshot', () => {
      const { result } = renderSquare()

      act(() => result.current.movePoint(9, { lat: 9, lng: 9 }))
      expect(result.current.points).toEqual([a, b, c, d])

      // If the no-op had pushed a spurious snapshot, this undo would restore
      // the unchanged square instead of walking back past the fourth
      // `addPoint`.
      act(() => result.current.undo())

      expect(result.current.points).toEqual([a, b, c])
    })
  })

  describe('removePoint', () => {
    it('removes the point at the given index', () => {
      const { result } = renderSquare()

      act(() => result.current.removePoint(1))

      expect(result.current.points).toEqual([a, c, d])
    })

    it('is a no-op for an out-of-range index, and takes no snapshot', () => {
      const { result } = renderSquare()

      act(() => result.current.removePoint(9))
      expect(result.current.points).toEqual([a, b, c, d])

      // If the no-op had pushed a spurious snapshot, this undo would restore
      // the unchanged square instead of walking back past the fourth
      // `addPoint`.
      act(() => result.current.undo())

      expect(result.current.points).toEqual([a, b, c])
    })
  })

  describe('setPoints', () => {
    it('replaces the whole ring in one mutation', () => {
      const { result } = renderHook(() => usePolygonEditor())

      act(() => result.current.setPoints([a, b, c]))

      expect(result.current.points).toEqual([a, b, c])
    })

    it('is undoable, restoring the ring from before the replacement -- even from empty', () => {
      // This is the shape a finished Leaflet-Geoman draw feeds in: the ring
      // goes straight from empty to a whole closed polygon in one `pm:create`
      // event, not one `addPoint` per vertex, so `setPoints` has to take its
      // own snapshot rather than piggyback on one `addPoint` already having.
      const { result } = renderHook(() => usePolygonEditor())

      act(() => result.current.setPoints([a, b, c, d]))
      expect(result.current.points).toEqual([a, b, c, d])
      expect(result.current.canUndo).toBe(true)

      act(() => result.current.undo())

      expect(result.current.points).toEqual([])
    })

    it('snapshots the prior ring, not the one it replaces it with', () => {
      const { result } = renderSquare()

      act(() =>
        result.current.setPoints([
          { lat: 5, lng: 5 },
          { lat: 6, lng: 6 },
          { lat: 7, lng: 7 }
        ])
      )
      act(() => result.current.undo())

      expect(result.current.points).toEqual([a, b, c, d])
    })
  })

  it('propagates an error from validateRing that is not InvalidPolygonError, instead of swallowing it', () => {
    // deriveState only translates InvalidPolygonError into `problem`/`hint` --
    // anything else (a genuine bug elsewhere) must not be hidden behind a
    // calm-looking editor state.
    const spy = vi.spyOn(geo, 'validateRing').mockImplementation(() => {
      throw new Error('boom')
    })

    expect(() => renderHook(() => usePolygonEditor())).toThrow('boom')

    spy.mockRestore()
  })
})
