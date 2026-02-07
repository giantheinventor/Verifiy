import { useState } from 'react'

interface LoginModalProps {
    isOpen: boolean
    onClose: () => void
    onOAuthLogin: () => void
    onApiKeySubmit: (apiKey: string) => void
}

export function LoginModal({
    isOpen,
    onClose,
    onOAuthLogin,
    onApiKeySubmit
}: LoginModalProps): React.JSX.Element | null {
    const [apiKey, setApiKey] = useState('')
    const [showApiKeyInput, setShowApiKeyInput] = useState(false)

    if (!isOpen) return null

    const handleApiKeySubmit = (): void => {
        if (apiKey.trim()) {
            onApiKeySubmit(apiKey.trim())
            setApiKey('')
            setShowApiKeyInput(false)
        }
    }

    const handleOverlayClick = (e: React.MouseEvent): void => {
        if (e.target === e.currentTarget) {
            onClose()
        }
    }

    return (
        <div className="login-modal-overlay" onClick={handleOverlayClick}>
            <div className="login-modal">
                <button className="login-modal-close" onClick={onClose} aria-label="Close">
                    ×
                </button>

                <h2 className="login-modal-title">Choose Login Method</h2>

                {!showApiKeyInput ? (
                    <div className="login-modal-options">
                        <button className="login-modal-btn login-modal-btn-oauth" onClick={onOAuthLogin}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Sign in with Google
                        </button>

                        <div className="login-modal-divider">
                            <span>or</span>
                        </div>

                        <button
                            className="login-modal-btn login-modal-btn-api"
                            onClick={() => setShowApiKeyInput(true)}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                            </svg>
                            Use API Key
                        </button>
                    </div>
                ) : (
                    <div className="login-modal-api-form">
                        <p className="login-modal-api-description">
                            Enter your Gemini API key. You can get one from{' '}
                            <a
                                href="https://aistudio.google.com/app/apikey"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Google AI Studio
                            </a>
                        </p>

                        <input
                            type="password"
                            className="login-modal-input"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Enter your API key..."
                            autoFocus
                        />

                        <div className="login-modal-api-actions">
                            <button
                                className="login-modal-btn login-modal-btn-back"
                                onClick={() => {
                                    setShowApiKeyInput(false)
                                    setApiKey('')
                                }}
                            >
                                Back
                            </button>
                            <button
                                className="login-modal-btn login-modal-btn-submit"
                                onClick={handleApiKeySubmit}
                                disabled={!apiKey.trim()}
                            >
                                Connect
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
