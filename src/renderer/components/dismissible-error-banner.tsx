import { X } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'

export function DismissibleErrorBanner({ message }: { message: string | null }): ReactElement | null {
  const [visible, setVisible] = useState(Boolean(message))

  useEffect(() => {
    if (!message) {
      setVisible(false)
      return undefined
    }

    setVisible(true)
    return undefined
  }, [message])

  if (!message || !visible) return null

  return (
    <div className="error-banner shell-error pv-stage-attention" role="alert">
      <div><strong>Action needed</strong><span>{message}</span></div>
      <button aria-label="Dismiss error" onClick={() => setVisible(false)} type="button">
        <X size={14} />
      </button>
    </div>
  )
}
