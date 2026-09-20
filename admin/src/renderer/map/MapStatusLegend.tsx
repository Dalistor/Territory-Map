import { CATEGORY_COLOR } from './blockColor'

const STATUS_ITEMS = [
  { label: 'Nunca trabalhada', color: CATEGORY_COLOR.never },
  { label: 'Vencida', color: CATEGORY_COLOR.overdue },
  { label: 'Em dia', color: CATEGORY_COLOR.recent }
] as const

/** Explains the block colours without intercepting clicks on the map below. */
export function MapStatusLegend(): React.JSX.Element {
  return (
    <aside className="map-status-legend" aria-label="Legenda de status das quadras">
      {STATUS_ITEMS.map((item) => (
        <span className="map-status-legend-item" key={item.label}>
          <span
            className="map-status-legend-swatch"
            aria-hidden="true"
            style={{ backgroundColor: item.color }}
          />
          <span>{item.label}</span>
        </span>
      ))}
    </aside>
  )
}
