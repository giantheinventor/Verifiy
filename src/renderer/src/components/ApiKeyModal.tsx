import { useState } from 'react'
import Icons from './Icons'

interface ApiKeyModalProps {
    isOpen: boolean
    onClose: () => void
    currentKeyExists: boolean
    onSave: (key: string) => void
    onDelete: () => void
}

export function ApiKeyModal({
    isOpen,
    onClose,
    currentKeyExists,
    onSave,
    onDelete
}: ApiKeyModalProps): React.JSX.Element | null {
    const [inputKey, setInputKey] = useState('')
    const [showConfirmDelete, setShowConfirmDelete] = useState(false)

    if (!isOpen) return null

    const handleSave = (): void => {
        if (inputKey.trim()) {
            onSave(inputKey.trim())
            setInputKey('')
            onClose()
        }
    }

    const handleDelete = (): void => {
        if (showConfirmDelete) {
            onDelete()
            setShowConfirmDelete(false)
            onClose()
        } else {
            setShowConfirmDelete(true)
        }
    }

    const handleClose = (): void => {
        setInputKey('')
        setShowConfirmDelete(false)
        onClose()
    }

    return (
        <div className="api-key-modal-overlay" onClick={handleClose}>
            <div className="api-key-modal" onClick={(e) => e.stopPropagation()}>
                <button className="api-key-modal-close" onClick={handleClose}>
                    <Icons.Close size={20} />
                </button>

                <h2 className="api-key-modal-title">Manage API Key</h2>

                <div className="api-key-modal-status">
                    <span className={`status-indicator ${currentKeyExists ? 'active' : ''}`} />
                    <span>{currentKeyExists ? 'API Key stored' : 'No API Key stored'}</span>
                </div>

                <div className="api-key-modal-form">
                    <label className="api-key-modal-label">
                        {currentKeyExists ? 'Replace API Key' : 'Add API Key'}
                    </label>
                    <input
                        type="password"
                        className="api-key-modal-input"
                        placeholder="Paste your Gemini API key..."
                        value={inputKey}
                        onChange={(e) => setInputKey(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    />
                    <p className="api-key-modal-hint">
                        Get your key from{' '}
                        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                            Google AI Studio
                        </a>
                    </p>
                </div>

                <div className="api-key-modal-actions">
                    {currentKeyExists && (
                        <button
                            className={`api-key-modal-btn delete ${showConfirmDelete ? 'confirm' : ''}`}
                            onClick={handleDelete}
                        >
                            {showConfirmDelete ? 'Confirm Delete' : 'Delete Key'}
                        </button>
                    )}
                    <button
                        className="api-key-modal-btn save"
                        onClick={handleSave}
                        disabled={!inputKey.trim()}
                    >
                        {currentKeyExists ? 'Replace Key' : 'Save Key'}
                    </button>
                </div>
            </div>
        </div>
    )
}
