import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { AppError } from '../types/errorTypes'
import { ErrorFactory } from '../types/errorTypes'

interface ErrorContextType {
  errors: AppError[]
  addError: (error: AppError) => void
  removeError: (id: string) => void
  clearAllErrors: () => void
}

const ErrorContext = createContext<ErrorContextType | null>(null)

export function useError(): ErrorContextType {
  const context = useContext(ErrorContext)
  if (!context) {
    throw new Error('useError must be used within an ErrorProvider')
  }
  return context
}

interface ErrorProviderProps {
  children: ReactNode
}

export function ErrorProvider({ children }: ErrorProviderProps): React.JSX.Element {
  const [errors, setErrors] = useState<AppError[]>([])

  // Add or update an error (same ID replaces existing)
  const addError = useCallback((error: AppError) => {
    setErrors((prev) => {
      // Remove existing error with same ID, add new one
      const filtered = prev.filter((e) => e.id !== error.id)
      return [...filtered, error].sort((a, b) => b.priority - a.priority)
    })
  }, [])

  // Remove error by ID
  const removeError = useCallback((id: string) => {
    setErrors((prev) => prev.filter((e) => e.id !== id))
  }, [])

  // Clear all errors
  const clearAllErrors = useCallback(() => {
    setErrors([])
  }, [])

  // Auto-healing: Listen for online status
  useEffect(() => {
    const handleOnline = (): void => {
      removeError('network-offline')
    }

    const handleOffline = (): void => {
      addError(ErrorFactory.networkOffline())
    }

    // Initial check
    if (!navigator.onLine) {
      handleOffline()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [removeError, addError])

  // Auto-dismiss errors with autoDismissMs
  useEffect(() => {
    const timers: NodeJS.Timeout[] = []

    errors.forEach((error) => {
      if (error.autoDismissMs) {
        const elapsed = Date.now() - error.timestamp
        const remaining = error.autoDismissMs - elapsed

        if (remaining > 0) {
          const timer = setTimeout(() => {
            removeError(error.id)
          }, remaining)
          timers.push(timer)
        } else {
          // Already expired, remove immediately
          removeError(error.id)
        }
      }
    })

    return () => {
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [errors, removeError])

  return (
    <ErrorContext.Provider value={{ errors, addError, removeError, clearAllErrors }}>
      {children}
    </ErrorContext.Provider>
  )
}
