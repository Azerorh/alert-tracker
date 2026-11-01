import type { ReactNode } from 'react'

type Props = {
  accent: string
  kicker: string
  title: string
  onClose: () => void
  children: ReactNode
}

/** Header stays put; body scrolls. Close is always in the sheet corner. */
export function SheetChrome({ accent, kicker, title, onClose, children }: Props) {
  return (
    <>
      <div className="sheet-chrome">
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрити">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              d="M4 4l10 10M14 4L4 14"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="sheet-grab" aria-hidden>
          <span />
        </div>
        <div className="sheet-accent" style={{ background: accent }} />
        <div className="sheet-head">
          <p className="sheet-kicker" style={{ color: accent }}>
            {kicker}
          </p>
          <h2 className="sheet-title">{title}</h2>
        </div>
      </div>
      <div className="sheet-scroll">{children}</div>
    </>
  )
}
