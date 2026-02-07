import { useState, useEffect } from 'react'
import type { AppError } from '../types/errorTypes'
import Icons from './Icons'

interface ErrorOverlayProps {
  errors: AppError[]
  onDismiss: (id: string) => void
}

export function ErrorOverlay({ errors, onDismiss }: ErrorOverlayProps): React.JSX.Element | null {
  if (errors.length === 0) {
    return null
  }

  return (
    <div className="error-overlay">
      {errors.map((error) => (
        <ErrorCard key={error.id} error={error} onDismiss={() => onDismiss(error.id)} />
      ))}
    </div>
  )
}

interface ErrorCardProps {
  error: AppError
  onDismiss: () => void
}

function ErrorCard({ error, onDismiss }: ErrorCardProps): React.JSX.Element {
  const [countdown, setCountdown] = useState<number | null>(null)

  // Handle countdown for auto-dismiss errors
  useEffect(() => {
    if (!error.autoDismissMs) return

    const updateCountdown = (): void => {
      const elapsed = Date.now() - error.timestamp
      const remaining = Math.max(0, error.autoDismissMs! - elapsed)
      setCountdown(Math.ceil(remaining / 1000))
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)

    return () => clearInterval(interval)
  }, [error.autoDismissMs, error.timestamp])

  const getErrorIcon = (): React.JSX.Element => {
    switch (error.type) {
      case 'NETWORK':
        return <Icons.NoInput size={20} />
      case 'QUOTA':
        return <Icons.Timer size={20} />
      case 'PERMISSION':
        return <Icons.Lock size={20} />
      case 'API_KEY':
        return <Icons.Key size={20} />
      case 'CONNECTION':
        return <Icons.Disconnect size={20} />
      default:
        return <Icons.Alert size={20} />
    }
  }

  return (
    <div className={`error-card error-card-${error.type.toLowerCase()}`}>
      <div className="error-card-icon">{getErrorIcon()}</div>
      <div className="error-card-content">
        <div className="error-card-header">
          <span className="error-card-type">{formatErrorType(error.type)}</span>
          {countdown !== null && countdown > 0 && (
            <span className="error-card-countdown">{countdown}s</span>
          )}
        </div>
        <p className="error-card-message">{error.message}</p>
        {error.action && (
          <button className="error-card-action" onClick={error.action}>
            {error.actionLabel ?? 'Try Again'}
          </button>
        )}
      </div>
      <button className="error-card-dismiss" onClick={onDismiss} aria-label="Dismiss error">
        ×
      </button>
    </div>
  )
}

function formatErrorType(type: string): string {
  const labels: Record<string, string> = {
    NETWORK: 'Network Error',
    QUOTA: 'Rate Limited',
    PERMISSION: 'Permission Required',
    API_KEY: 'API Key Error',
    CONNECTION: 'Connection Error'
  }
  return labels[type] ?? 'Error'
}
