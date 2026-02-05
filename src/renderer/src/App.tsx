import { useState, useEffect, useRef, useCallback } from 'react'
import './assets/main.css'
import { AudioCapture } from './components/AudioCapture'
import { connectToLiveSession, verifyClaimWithSearch } from './services/geminiService'
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
  const [screenEnabled, setScreenEnabled] = useState(true)
  const [micEnabled, setMicEnabled] = useState(false)
  const [cards, setCards] = useState<Card[]>([])
  const [isConnecting, setIsConnecting] = useState(false)
  const cardListRef = useRef<HTMLDivElement>(null)
  const liveSessionRef = useRef<Session | null>(null)

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
  const handleClaimDetected = useCallback(async (claimText: string) => {
    const cardId = getNextId()

    setCards(prev => [...prev, {
      id: cardId,
      title: claimText,
      content: '',
      timestamp: getTimestamp(),
      verdict: 'Pending',
      isVerifying: true,
      isClaim: true
    }])

    try {
      const { result, sources } = await verifyClaimWithSearch(claimText)

      updateCard(cardId, {
        content: result.explanation,
        verdict: result.verdict,
        isVerifying: false,
        sources: sources
      })
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
                const claimText = fc.args.claim_text
                handleClaimDetected(claimText)

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
      const sources: string[] = []
      if (screenEnabled) sources.push('Screen')
      if (micEnabled) sources.push('Microphone')
      addCard('Listening Started', `Sources: ${sources.join(' + ') || 'None'}`)
      await connectLiveSession()
    } else {
      addCard('Listening Stopped', 'Session paused')
      disconnectLiveSession()
    }
  }

  const toggleScreen = (): void => {
    const newValue = !screenEnabled
    setScreenEnabled(newValue)
    if (isListening) {
      addCard('Source Changed', `Screen audio ${newValue ? 'enabled' : 'disabled'}`)
    }
  }

  const toggleMic = (): void => {
    const newValue = !micEnabled
    setMicEnabled(newValue)
    if (isListening) {
      addCard('Source Changed', `Microphone ${newValue ? 'enabled' : 'disabled'}`)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectLiveSession()
    }
  }, [disconnectLiveSession])

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <button className="menu-button" aria-label="Menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className="header-controls">
          {/* Screen Audio Toggle */}
          <button
            className={`source-button ${screenEnabled ? 'active' : ''}`}
            onClick={toggleScreen}
            aria-label="Toggle screen audio"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span>Screen</span>
          </button>

          {/* Microphone Toggle */}
          <button
            className={`source-button ${micEnabled ? 'active' : ''}`}
            onClick={toggleMic}
            aria-label="Toggle microphone"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <span>Mic</span>
          </button>
        </div>

        {isConnecting && <span className="connecting-indicator">Connecting...</span>}
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Audio Capture Button */}
        <AudioCapture
          isListening={isListening}
          onClick={handleListenClick}
          screenEnabled={screenEnabled}
          micEnabled={micEnabled}
          onAudioData={handleAudioData}
        />

        {/* Card List with fade effect */}
        <div className="card-list-container">
          <div className="card-list-fade" />
          <div className="card-list" ref={cardListRef}>
            {cards.map(card => (
              <div
                key={card.id}
                className={`context-card ${card.isClaim ? 'claim-card' : ''} ${card.verdict ? `verdict-${card.verdict.toLowerCase()}` : ''}`}
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
                {card.content && <p className="card-content">{card.content}</p>}
                {card.sources && card.sources.length > 0 && (
                  <div className="card-sources">
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
            ))}
          </div>
        </div>
      </main>

      {/* Help Button */}
      <button className="help-button" aria-label="Help">
        <span>?</span>
      </button>
    </div>
  )
}

export default App
