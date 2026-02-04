import { useState, useEffect, useRef } from 'react'
import './assets/main.css'

interface Card {
  id: number
  title: string
  content: string
  timestamp: string
}

function App(): React.JSX.Element {
  const [isListening, setIsListening] = useState(false)
  const [mode, setMode] = useState<'screen' | 'mic'>('screen')
  const [cards, setCards] = useState<Card[]>([])
  const cardListRef = useRef<HTMLDivElement>(null)

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
      id: 1,
      title: 'Session Started',
      content: `Mode: ${mode === 'screen' ? 'Screen Share' : 'Microphone'}`,
      timestamp: timeStr
    }])
  }, [])

  const handleMicClick = () => {
    const newListening = !isListening
    setIsListening(newListening)

    // Add a card when listening state changes
    const now = new Date()
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })

    setCards(prev => [...prev, {
      id: Date.now(),
      title: newListening ? 'Listening Started' : 'Listening Stopped',
      content: newListening ? 'Waiting for audio input...' : 'Session paused',
      timestamp: timeStr
    }])
  }

  const toggleMode = () => {
    const newMode = mode === 'screen' ? 'mic' : 'screen'
    setMode(newMode)

    const now = new Date()
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })

    setCards(prev => [...prev, {
      id: Date.now(),
      title: 'Mode Changed',
      content: `Switched to ${newMode === 'screen' ? 'Screen Share' : 'Microphone'} mode`,
      timestamp: timeStr
    }])
  }

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
          <button className={`icon-button ${mode === 'screen' ? 'active' : ''}`} aria-label="Screen Share">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </button>

          <button className="toggle-switch" onClick={toggleMode} aria-label="Toggle mode">
            <span className={`toggle-slider ${mode === 'mic' ? 'active' : ''}`} />
          </button>

          <button className={`icon-button ${mode === 'mic' ? 'active' : ''}`} aria-label="Microphone">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Microphone Button */}
        <button
          className={`mic-button ${isListening ? 'listening' : ''}`}
          onClick={handleMicClick}
          aria-label={isListening ? 'Stop listening' : 'Start listening'}
        >
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>

        {/* Card List with fade effect */}
        <div className="card-list-container">
          <div className="card-list-fade" />
          <div className="card-list" ref={cardListRef}>
            {cards.map(card => (
              <div key={card.id} className="context-card">
                <div className="card-header">
                  <h3 className="card-title">{card.title}</h3>
                  <span className="card-timestamp">{card.timestamp}</span>
                </div>
                <p className="card-content">{card.content}</p>
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
