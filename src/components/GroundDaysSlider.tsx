import {
  GROUND_DAYS_MAX,
  GROUND_DAYS_MIN,
} from '../lib/warspotting'

type Props = {
  value: number
  onChange: (days: number) => void
}

export function GroundDaysSlider({ value, onChange }: Props) {
  return (
    <div className="ground-days" aria-label="Вікно даних на землі">
      <div className="ground-days-row">
        <span className="ground-days-label">Період</span>
        <strong className="ground-days-value">
          {value} {value === 1 ? 'доба' : value < 5 ? 'доби' : 'діб'}
        </strong>
      </div>
      <input
        className="ground-days-range"
        type="range"
        min={GROUND_DAYS_MIN}
        max={GROUND_DAYS_MAX}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuemin={GROUND_DAYS_MIN}
        aria-valuemax={GROUND_DAYS_MAX}
        aria-valuenow={value}
        aria-valuetext={`${value} діб`}
      />
      <div className="ground-days-ends">
        <span>{GROUND_DAYS_MIN}</span>
        <span>{GROUND_DAYS_MAX}</span>
      </div>
    </div>
  )
}
