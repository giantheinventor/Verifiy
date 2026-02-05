import { useState, useEffect, useRef, useCallback } from 'react'
import './assets/main.css'
import { AudioCapture } from './components/AudioCapture'
import Icons from './components/Icons'
import { Walkthrough } from './components/Walkthrough'
import { connectToLiveSession, verifyClaimWithSearch } from './services/geminiService'
import { requestNotificationPermission, sendClaimNotification } from './utils/notificationUtils'
import type { Blob as GeminiBlob, Session } from '@google/genai'

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

function App(): React.JSX.Element {
  const [isListening, setIsListening] = useState(false)
  const [inputMode, setInputMode] = useState<'screen' | 'mic' | 'both' | 'none'>('screen')
  const [cards, setCards] = useState<Card[]>([])
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [showWalkthrough, setShowWalkthrough] = useState(false)
  const cardListRef = useRef<HTMLDivElement>(null)
  const liveSessionRef = useRef<Session | null>(null)

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

  // Toggle dark mode (manual override)
  const toggleDarkMode = (): void => {
    setIsDarkMode(prev => !prev)
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

    setCards([{
      id: crypto.randomUUID(),
      title: 'Session Started',
      content: 'Ready to capture audio',
      timestamp: timeStr
    }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setCards(prev => [...prev, {
      id: getNextId(),
      title,
      content,
      timestamp: getTimestamp(),
      ...extra
    }])
  }, [])

  const updateCard = useCallback((id: string, updates: Partial<Card>) => {
    setCards(prev => prev.map(card =>
      card.id === id ? { ...card, ...updates } : card
    ))
  }, [])

  // Handle claim detection from Gemini
  const handleClaimDetected = useCallback(async (claimTitle: string, claimText: string) => {
    const cardId = getNextId()

    setCards(prev => [...prev, {
      id: cardId,
      title: claimTitle,
      content: '',
      timestamp: getTimestamp(),
      verdict: 'Pending',
      isVerifying: true,
      isClaim: true
    }])

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
        (result.verdict === 'False' || result.verdict === 'Misleading') &&
        document.visibilityState === 'hidden'
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
  }, [updateCard])

  // Connect to live session
  const connectLiveSession = useCallback(async () => {
    if (liveSessionRef.current) return

    setIsConnecting(true)
    addCard('Connecting', 'Establishing connection to Gemini...')

    try {
      const session = await connectToLiveSession({
        onopen: () => {
          addCard('Connected', 'Live session established. Listening for claims...')
          setIsConnecting(false)
        },
        onclose: () => {
          addCard('Disconnected', 'Live session closed.')
          liveSessionRef.current = null
        },
        onerror: (error) => {
          console.error('Live session error:', error)
          addCard('Error', `Connection error: ${error}`)
          setIsConnecting(false)
        },
        onmessage: async (message: any) => {
          if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
              if (fc.name === 'detect_claim') {
                const claimTitle = fc.args.claim_title || 'Claim'
                const claimText = fc.args.claim_text
                handleClaimDetected(claimTitle, claimText)

                session.sendToolResponse({
                  functionResponses: [{
                    id: fc.id,
                    name: fc.name,
                    response: { result: 'ok' }
                  }]
                })
              }
            }
          }
        }
      })

      liveSessionRef.current = session
    } catch (error) {
      console.error('Failed to connect:', error)
      addCard('Error', 'Failed to connect to Gemini.')
      setIsConnecting(false)
    }
  }, [addCard, handleClaimDetected])

  // Disconnect live session
  const disconnectLiveSession = useCallback(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.close()
      liveSessionRef.current = null
    }
  }, [])

  // Handle audio data from AudioCapture - send to Gemini
  const handleAudioData = useCallback((blob: GeminiBlob) => {
    if (liveSessionRef.current && blob.data && blob.mimeType) {
      liveSessionRef.current.sendRealtimeInput({
        media: {
          data: blob.data,
          mimeType: blob.mimeType
        }
      })
    }
  }, [])

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

  return (
    <div className={`app-container ${isDarkMode ? 'dark-mode' : ''}`}>
      {/* Header */}
      <header className="header">
        <button className="menu-button" onClick={toggleDarkMode} aria-label="Toggle dark mode" title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
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

        {/* Card List with fade effect */}
        <div className="card-list-container">
          <div className="card-list-fade" />
          <div className="card-list" ref={cardListRef}>
            {cards.map(card => {
              const isExpanded = expandedCards.has(card.id)
              const toggleExpand = () => {
                setExpandedCards(prev => {
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
                    <div className="card-sources" onClick={e => e.stopPropagation()}>
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
    </div>
  )
}

export default App
