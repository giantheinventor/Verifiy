// Error types for the centralized error handling system

export type ErrorType = 'NETWORK' | 'QUOTA' | 'PERMISSION' | 'API_KEY' | 'CONNECTION'

export interface AppError {
  id: string
  type: ErrorType
  message: string
  action?: () => void
  actionLabel?: string
  priority: number // Higher = more important, shown first
  autoDismissMs?: number // Auto-dismiss after this time (for quota countdown)
  timestamp: number
}

// Priority levels (higher = more important)
export const ERROR_PRIORITY: Record<ErrorType, number> = {
  NETWORK: 100,
  API_KEY: 90,
  QUOTA: 80,
  PERMISSION: 70,
  CONNECTION: 60
}

// Helper to create errors with consistent structure
export function createError(
  type: ErrorType,
  message: string,
  options?: {
    id?: string
    action?: () => void
    actionLabel?: string
    autoDismissMs?: number
  }
): AppError {
  return {
    id: options?.id ?? `${type.toLowerCase()}-${Date.now()}`,
    type,
    message,
    priority: ERROR_PRIORITY[type],
    action: options?.action,
    actionLabel: options?.actionLabel,
    autoDismissMs: options?.autoDismissMs,
    timestamp: Date.now()
  }
}

// Pre-defined error creators for common errors
export const ErrorFactory = {
  networkOffline: () =>
    createError(
      'NETWORK',
      'You are offline. Reconnecting automatically when internet is available...',
      {
        id: 'network-offline'
      }
    ),

  quotaExceeded: (retryMs: number = 60000) =>
    createError(
      'QUOTA',
      `API rate limit reached. Retrying in ${Math.ceil(retryMs / 1000)} seconds...`,
      {
        id: 'quota-exceeded',
        autoDismissMs: retryMs
      }
    ),

  permissionDenied: (source: 'mic' | 'screen') =>
    createError(
      'PERMISSION',
      source === 'mic'
        ? 'Microphone access was denied. Please allow access in System Settings.'
        : 'Screen recording access was denied. Please allow access in System Settings.',
      { id: `permission-${source}` }
    ),

  connectionFailed: (details?: string) =>
    createError('CONNECTION', details ?? 'Failed to connect to Gemini. Please try again.', {
      id: 'connection-failed'
    }),

  apiKeyInvalid: () =>
    createError('API_KEY', 'Invalid or expired API key.', {
      id: 'api-key-invalid'
    })
}
