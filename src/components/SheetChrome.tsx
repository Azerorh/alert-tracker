import type { ReactNode } from 'react'

type Props = {
  accent: string
  kicker: string
  title: string
  onClose: () => void
  children?: ReactNode
}

/** Shared mobile-safe header: grab + always-visible close + title. */
export function SheetChrome({ accent, kicker, title, onClose, children }: Props) {
  return (
    <>
      <div className="sheet-topbar">
        <span className="sheet-topbar-spacer" aria-hidden />
        <div className="sheet-grab" aria-hidden>
          <span />
        </div>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрити">
          ✕
        </button>
      </div>
      <div className="sheet-accent" style={{ background: accent }} />
      <div className="sheet-head">
        <p className="sheet-kicker" style={{ color: accent }}>
          {kicker}
        </p>
        <h2 className="sheet-title">{title}</h2>
      </div>
      {children}
    </>
  )
}
