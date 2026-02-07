import { useState, useEffect, useRef, useCallback } from 'react'
import './assets/main.css'
import { AudioCapture } from './components/AudioCapture'
import Icons from './components/Icons'
import { Walkthrough } from './components/Walkthrough'
import { ErrorOverlay } from './components/ErrorOverlay'
import { LoginModal } from './components/LoginModal'
import { Sidebar } from './components/Sidebar'
import { ApiKeyModal } from './components/ApiKeyModal'
import { connectToLiveSession, verifyClaimWithSearch, connectWithApiKey, disconnect } from './services/geminiService'
import { requestNotificationPermission, sendClaimNotification } from './utils/notificationUtils'
import { ErrorProvider, useError } from './context/ErrorContext'
import { ErrorFactory } from './types/errorTypes'
import type { Blob as GeminiBlob, Session } from '@google/genai'

const MAX_CARDS = 100

interface Card {
  id: string
  title: string
  content: string
  timestamp: string
  verdict?: 'Pending' | 'True' | 'False' | 'Misleading' | 'Unverified' | 'Mixed'
  isVerifying?: boolean
  isClaim?: boolean
  sources?: { title: string; uri: string }[]
}

function AppContent(): React.JSX.Element {
  const { errors, addError, removeError } = useError()
  const [isListening, setIsListening] = useState(false)
  const [inputMode, setInputMode] = useState<'screen' | 'mic' | 'both' | 'none'>('screen')
  const [cards, setCards] = useState<Card[]>([])
  const [_isConnecting, setIsConnecting] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [showWalkthrough, setShowWalkthrough] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [hasOAuthLogin, setHasOAuthLogin] = useState(false)
  const [storedApiKey, setStoredApiKey] = useState<string | null>(null)
  const [authMode, setAuthMode] = useState<'apiKey' | 'oauth' | null>(null)
  const cardListRef = useRef<HTMLDivElement>(null)
  const liveSessionRef = useRef<Session | null>(null)
  const isOAuthSessionActiveRef = useRef(false)

  // Derived state for checking available auth methods
  const hasApiKey = !!storedApiKey
  const canSwitchToOAuth = hasOAuthLogin && authMode === 'apiKey'
  const canSwitchToApiKey = hasApiKey && authMode === 'oauth'

  // Sync with system theme preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent): void => setIsDarkMode(e.matches)

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Request notification permission
  useEffect(() => {
    requestNotificationPermission()
  }, [])

  // Listen for OAuth status from main process
  useEffect(() => {
    const removeListener = window.api.onAuthStatus((status) => {
      console.log('Received auth status:', status)
      if (status.success && (status.type === 'oauth' || status.type === 'refresh')) {
        setHasOAuthLogin(true)
        if (status.type === 'oauth') {
          setAuthMode('oauth')
          addCard('Login Successful', 'Connected to Google account. Using OAuth authentication.')
        }
      } else if (!status.success) {
        setHasOAuthLogin(false)
        if (authMode === 'oauth') {
          setAuthMode(null)
        }
      }
    })

    return () => {
      removeListener()
    }
  }, [authMode])



  // Handle OAuth login from modal
  const handleOAuthLogin = (): void => {
    console.log('Starting OAuth flow...')
    setShowLoginModal(false)
    window.api.startOAuth()
  }

  // Handle API key submission from modal
  const handleApiKeySubmit = (apiKey: string): void => {
    console.log('Connecting with API key...')
    setShowLoginModal(false)
    if (connectWithApiKey(apiKey)) {
      setStoredApiKey(apiKey)
      setAuthMode('apiKey')
      addCard('Login Successful', 'Connected with API key.')
    } else {
      addCard('Login Failed', 'Could not connect with API key.')
    }
  }

  // Toggle between API key and OAuth authentication
  const toggleAuthMode = (): void => {
    // Disconnect active session before switching
    if (isListening) {
      disconnectLiveSession()
      setIsListening(false)
      addCard('Session Stopped', 'Disconnected before switching auth mode.')
    }

    if (authMode === 'apiKey' && canSwitchToOAuth) {
      setAuthMode('oauth')
      addCard('Auth Mode Changed', 'Switched to OAuth authentication.')
    } else if (authMode === 'oauth' && canSwitchToApiKey) {
      if (connectWithApiKey(storedApiKey!)) {
        setAuthMode('apiKey')
        addCard('Auth Mode Changed', 'Switched to API Key authentication.')
      }
    }
  }

  // Toggle dark mode (manual override)
  const toggleDarkMode = (): void => {
    setIsDarkMode((prev) => !prev)
  }

  // Auto-scroll to bottom when cards change
  useEffect(() => {
    if (cardListRef.current) {
      cardListRef.current.scrollTop = cardListRef.current.scrollHeight
    }
  }, [cards])

  // Add initial card on mount
  useEffect(() => {
    const now = new Date()
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })

    setCards([
      {
        id: crypto.randomUUID(),
        title: 'Session Started',
        content: 'Ready to capture audio',
        timestamp: timeStr
      }
    ])
  }, [])

  const getTimestamp = (): string => {
    const now = new Date()
    return now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
  }

  const getNextId = (): string => crypto.randomUUID()

  const addCard = useCallback((title: string, content: string, extra?: Partial<Card>) => {
    setCards((prev) => {
      const newCard = {
        id: getNextId(),
        title,
        content,
        timestamp: getTimestamp(),
        ...extra
      }
      const newCards = [...prev, newCard]
      // Keep only the last MAX_CARDS
      return newCards.slice(-MAX_CARDS)
    })
  }, [])

  const updateCard = useCallback((id: string, updates: Partial<Card>) => {
    setCards((prev) => prev.map((card) => (card.id === id ? { ...card, ...updates } : card)))
  }, [])

  // Handle claim detection from Gemini
  const handleClaimDetected = useCallback(
    async (claimTitle: string, claimText: string) => {
      const cardId = getNextId()

      setCards((prev) => {
        const newCard = {
          id: cardId,
          title: claimTitle,
          content: '',
          timestamp: getTimestamp(),
          verdict: 'Pending' as const,
          isVerifying: true,
          isClaim: true
        }
        const newCards = [...prev, newCard]
        return newCards.slice(-MAX_CARDS)
      })

      // Verify the claim (only if NOT in OAuth mode - OAuth handles this in main process)
      if (authMode === 'oauth') return

      // Verify the claim using claimText
      try {
        const { result, sources } = await verifyClaimWithSearch(claimText)

        updateCard(cardId, {
          content: result.explanation,
          verdict: result.verdict,
          isVerifying: false,
          sources: sources
        })

        // Send notification if claim is false/misleading and app is in background
        if (
          (result.verdict === 'False') &&
          (document.visibilityState === 'hidden' || !document.hasFocus())
        ) {
          sendClaimNotification(
            'False Claim Detected',
            `"${claimTitle}" was detected as ${result.verdict}.`
          )
        }
      } catch (error) {
        console.error('Verification error:', error)
        updateCard(cardId, {
          content: 'Could not verify this claim.',
          verdict: 'Unverified',
          isVerifying: false
        })
      }
    }, [updateCard, authMode])

  // Listen for Gemini data from main process (OAuth mode only)
  useEffect(() => {
    if (authMode !== 'oauth') return

    const removeListener = window.api.onGeminiData((data) => {
      console.log('Received Gemini data:', data)

      switch (data.type) {
        case 'setup_complete':
          addCard('Connected', 'Live session established. Listening for claims...')
          setIsConnecting(false)
          break
        case 'tool_call':
          // Claim detected - handle it
          if (data.data?.name === 'detect_claim') {
            const claimTitle = data.data.args?.claim_title || 'Claim'
            const claimText = data.data.args?.claim_text
            if (claimText) {
              handleClaimDetected(claimTitle, claimText)
            }
          }
          break
        case 'closed':
        case 'stopped':
          if (isOAuthSessionActiveRef.current) {
            addCard('Disconnected', 'Live session closed.')
            isOAuthSessionActiveRef.current = false
          }
          break
        case 'error':
          addCard('Error', `Connection error: ${data.data?.message || 'Unknown error'}`)
          setIsConnecting(false)
          break
      }
    })

    return () => {
      removeListener()
    }
  }, [authMode, addCard, handleClaimDetected])

  // Listen for fact check results from main process (OAuth mode only)
  useEffect(() => {
    if (authMode !== 'oauth') return

    const removeListener = window.api.onFactCheckResult((result) => {
      console.log('Received fact check result:', result)

      // Find the pending claim card and update it
      setCards(prev => {
        console.log('Checking cards for match:', prev.map(c => ({ id: c.id, title: c.title, isVerifying: c.isVerifying })))
        return prev.map(card => {
          if (card.isClaim && card.title === result.claimTitle && card.isVerifying) {
            console.log('Match found for card:', card.id)
            if (result.error) {
              return {
                ...card,
                content: 'Could not verify this claim.',
                verdict: 'Unverified' as const,
                isVerifying: false
              }
            }

            const verdict = result.result?.verdict || 'Unverified'
            return {
              ...card,
              content: result.result?.explanation || '',
              verdict: verdict as Card['verdict'],
              isVerifying: false,
              sources: result.result?.sources || []
            }
          }
          return card
        })
      })

      // Send notification if claim is false/misleading and app is in background
      if (
        result.result?.verdict === 'False' &&
        (document.visibilityState === 'hidden' || !document.hasFocus())
      ) {
        sendClaimNotification(
          'False Claim Detected',
          `"${result.claimTitle}" was detected as ${result.result.verdict}.`
        )
      }
    })

    return () => {
      removeListener()
    }
  }, [authMode])

  // Connect to live session (routes based on authMode)
  const connectLiveSession = useCallback(async () => {
    if (liveSessionRef.current) return

    // Check network status before connecting
    if (!navigator.onLine) {
      addError(ErrorFactory.networkOffline())
      return
    }

    setIsConnecting(true)
    addCard('Connecting', 'Establishing connection to Gemini...')

    if (authMode === 'oauth') {
      // OAuth mode: use main process IPC
      isOAuthSessionActiveRef.current = true
      window.api.startSession()
      // Connection feedback comes via onGeminiData listener
    } else {
      // API Key mode: use renderer's geminiService directly
      if (liveSessionRef.current) return

      try {
        const session = await connectToLiveSession({
          onopen: () => {
            addCard('Connected', 'Live session established. Listening for claims...')
            removeError('connection-failed')
            setIsConnecting(false)
          },
          onclose: () => {
            addCard('Disconnected', 'Live session closed.')
            liveSessionRef.current = null
          },
          onerror: (error) => {
            console.error('Live session error:', error)
            const errorMessage = String(error)
            // Check for quota/rate limit errors
            if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota')) {
              addError(ErrorFactory.quotaExceeded(60000))
            } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
              addError(ErrorFactory.apiKeyInvalid())
            } else {
              addError(ErrorFactory.connectionFailed(errorMessage))
            }
            // Close the session and reset listening state
            if (liveSessionRef.current) {
              liveSessionRef.current.close()
              liveSessionRef.current = null
            }
            setIsListening(false)
            setIsConnecting(false)
          },
          onmessage: async (message: unknown) => {
            const msg = message as {
              toolCall?: {
                functionCalls: Array<{
                  id: string
                  name: string
                  args: Record<string, string>
                }>
              }
            }
            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                if (fc.name === 'detect_claim') {
                  const claimTitle = fc.args.claim_title || 'Claim'
                  const claimText = fc.args.claim_text
                  handleClaimDetected(claimTitle, claimText)

                  session.sendToolResponse({
                    functionResponses: [
                      {
                        id: fc.id,
                        name: fc.name,
                        response: { result: 'ok' }
                      }
                    ]
                  })
                }
              }
            }
          }
        })

        liveSessionRef.current = session
      } catch (error) {
        console.error('Failed to connect:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        // Check for quota/rate limit errors
        if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota')) {
          addError(ErrorFactory.quotaExceeded(60000))
        } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
          addError(ErrorFactory.apiKeyInvalid())
        } else {
          addError(ErrorFactory.connectionFailed(errorMessage))
        }
        // Ensure session is closed and listening state is reset
        if (liveSessionRef.current) {
          liveSessionRef.current.close()
          liveSessionRef.current = null
        }
        setIsListening(false)
        setIsConnecting(false)
      }
    }
  }, [authMode, addCard, handleClaimDetected, addError, removeError])

  // Disconnect live session (routes based on authMode)
  const disconnectLiveSession = useCallback(() => {
    if (authMode === 'oauth') {
      // OAuth mode: use main process IPC
      isOAuthSessionActiveRef.current = false
      window.api.stopSession()
    } else {
      // API Key mode: close renderer session
      if (liveSessionRef.current) {
        liveSessionRef.current.close()
        liveSessionRef.current = null
      }
    }
  }, [authMode])

  // Handle audio data from AudioCapture - routes based on authMode
  const handleAudioData = useCallback((blob: GeminiBlob) => {
    if (!blob.data || !blob.mimeType) return

    if (authMode === 'oauth') {
      // OAuth mode: send via main process IPC
      window.api.sendAudioChunk(blob.data, blob.mimeType)
    } else {
      // API Key mode: send via renderer session
      if (liveSessionRef.current) {
        liveSessionRef.current.sendRealtimeInput({
          media: {
            data: blob.data,
            mimeType: blob.mimeType
          }
        })
      }
    }
  }, [authMode])

  const handleListenClick = async (): Promise<void> => {
    const newListening = !isListening
    setIsListening(newListening)

    if (newListening) {
      const modeLabels = {
        screen: 'Screen',
        mic: 'Microphone',
        both: 'Screen + Microphone',
        none: 'No input'
      }
      addCard('Listening Started', `Source: ${modeLabels[inputMode]}`)
      await connectLiveSession()
    } else {
      addCard('Listening Stopped', 'Session paused')
      disconnectLiveSession()
    }
  }

  const cycleInputMode = (): void => {
    const modes: Array<'screen' | 'mic' | 'both' | 'none'> = ['screen', 'mic', 'both', 'none']
    const currentIndex = modes.indexOf(inputMode)
    const nextMode = modes[(currentIndex + 1) % modes.length]
    setInputMode(nextMode)
    if (isListening) {
      const modeLabels = {
        screen: 'Screen',
        mic: 'Microphone',
        both: 'Screen + Microphone',
        none: 'No input'
      }
      addCard('Source Changed', `Now using: ${modeLabels[nextMode]}`)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectLiveSession()
    }
  }, [disconnectLiveSession])

  // Close session when network goes offline
  useEffect(() => {
    const handleOffline = (): void => {
      if (isListening) {
        disconnectLiveSession()
        setIsListening(false)
        addCard('Connection Lost', 'Session closed due to network disconnection.')
      }
    }

    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('offline', handleOffline)
    }
  }, [isListening, disconnectLiveSession, addCard])

  return (
    <div className={`app-container ${isDarkMode ? 'dark-mode' : ''}`}>
      {/* Header */}
      <header className="header">
        <button
          className="menu-button"
          onClick={() => setShowSidebar(true)}
          aria-label="Open settings"
          title="Settings"
        >
          <Icons.Menu size={24} />
        </button>

        <div className="header-controls">
          {/* Input Source Cycle Button */}
          <button
            className={`source-button ${inputMode !== 'none' ? 'active' : ''}`}
            onClick={cycleInputMode}
            aria-label="Cycle input source"
            title={`Current: ${inputMode === 'screen' ? 'Screen' : inputMode === 'mic' ? 'Microphone' : inputMode === 'both' ? 'Both' : 'None'}`}
          >
            {inputMode === 'screen' && <Icons.Screen size={20} />}
            {inputMode === 'mic' && <Icons.Mic size={20} />}
            {inputMode === 'both' && <Icons.Merge size={20} />}
            {inputMode === 'none' && <Icons.NoInput size={20} />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Audio Capture Button */}
        <AudioCapture
          isListening={isListening}
          onClick={handleListenClick}
          inputMode={inputMode}
          onAudioData={handleAudioData}
        />

        {/* Error Sentinel Overlay */}
        <ErrorOverlay errors={errors} onDismiss={removeError} />

        {/* Card List with fade effect */}
        <div className="card-list-container">
          <div className="card-list-fade" />
          <div className="card-list" ref={cardListRef}>
            {cards.map((card) => {
              const isExpanded = expandedCards.has(card.id)
              const toggleExpand = (): void => {
                setExpandedCards((prev) => {
                  const next = new Set(prev)
                  if (next.has(card.id)) {
                    next.delete(card.id)
                  } else {
                    next.add(card.id)
                  }
                  return next
                })
              }

              return (
                <div
                  key={card.id}
                  className={`context-card ${card.isClaim ? 'claim-card' : ''} ${card.verdict ? `verdict-${card.verdict.toLowerCase()}` : ''} ${isExpanded ? 'expanded' : ''}`}
                  onClick={card.isClaim ? toggleExpand : undefined}
                  style={{ cursor: card.isClaim ? 'pointer' : 'default' }}
                >
                  <div className="card-header">
                    <h3 className="card-title">{card.title}</h3>
                    {card.isClaim && card.verdict && (
                      <span className={`verdict-badge ${card.verdict.toLowerCase()}`}>
                        {card.verdict}
                      </span>
                    )}
                    {!card.isClaim && <span className="card-timestamp">{card.timestamp}</span>}
                  </div>
                  {/* Show content for non-claim cards always, for claim cards only when expanded */}
                  {(!card.isClaim || isExpanded) && card.content && (
                    <p className="card-content">{card.content}</p>
                  )}
                  {(!card.isClaim || isExpanded) && card.sources && card.sources.length > 0 && (
                    <div className="card-sources" onClick={(e) => e.stopPropagation()}>
                      {card.sources.map((source, index) => (
                        <a
                          key={index}
                          href={source.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="source-box"
                          title={source.uri}
                        >
                          {source.title || 'Source'}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {/* Help Button */}
      <button className="help-button" aria-label="Help" onClick={() => setShowWalkthrough(true)}>
        <span>?</span>
      </button>

      {/* Walkthrough Overlay */}
      <Walkthrough isOpen={showWalkthrough} onClose={() => setShowWalkthrough(false)} />

      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onOAuthLogin={handleOAuthLogin}
        onApiKeySubmit={handleApiKeySubmit}
      />

      {/* Sidebar */}
      <Sidebar
        isOpen={showSidebar}
        onClose={() => setShowSidebar(false)}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleDarkMode}
        authMode={authMode}
        hasOAuthLogin={hasOAuthLogin}
        hasApiKey={hasApiKey}
        onToggleAuthMode={toggleAuthMode}
        onManageApiKey={() => {
          setShowSidebar(false)
          setShowApiKeyModal(true)
        }}
        onLogin={() => {
          setShowSidebar(false)
          handleOAuthLogin()
        }}
        onLogout={() => {
          setShowSidebar(false)
          // Clear OAuth login state (tokens are cleared server-side on next auth)
          setHasOAuthLogin(false)
          if (authMode === 'oauth') {
            setAuthMode(hasApiKey ? 'apiKey' : null)
          }
        }}
      />

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        currentKeyExists={hasApiKey}
        onSave={(key) => {
          handleApiKeySubmit(key)
          setShowApiKeyModal(false)
        }}
        onDelete={() => {
          disconnect()  // Clear SDK client
          setStoredApiKey(null)
          if (authMode === 'apiKey') {
            setAuthMode(hasOAuthLogin ? 'oauth' : null)
          }
        }}
      />
    </div>
  )
}

// Main App component wrapped with ErrorProvider
function App(): React.JSX.Element {
  return (
    <ErrorProvider>
      <AppContent />
    </ErrorProvider>
  )
}

export default App
