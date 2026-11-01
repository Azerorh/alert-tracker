import type { WatchToast } from '../hooks/useOblastWatch'

type Props = {
  toasts: WatchToast[]
  onDismiss: (id: string) => void
}

export function WatchToasts({ toasts, onDismiss }: Props) {
  if (!toasts.length) return null
  return (
    <div className="watch-toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="watch-toast" role="status">
          <div>
            <p className="watch-toast-title">{t.title}</p>
            <p className="watch-toast-body">{t.body}</p>
          </div>
          <button type="button" className="watch-toast-close" onClick={() => onDismiss(t.id)} aria-label="Закрити">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
