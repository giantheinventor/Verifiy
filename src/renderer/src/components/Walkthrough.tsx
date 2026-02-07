import React, { useState, useEffect, useCallback } from 'react'

interface WalkthroughStep {
  targetSelector: string
  title: string
  description: string
  cardPosition: 'center-bottom' | 'upper-center' | 'center-right'
  requiresSidebar?: boolean
}

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    targetSelector: '.mic-button',
    title: 'Start Listening',
    description:
      'Tap this button to begin capturing audio. The app will listen for claims and automatically verify them.',
    cardPosition: 'center-bottom'
  },
  {
    targetSelector: '.source-button',
    title: 'Choose Your Source',
    description:
      'Cycle through input modes: Screen audio, Microphone, Both, or None. Pick what works best for your situation.',
    cardPosition: 'center-bottom'
  },
  {
    targetSelector: '.card-list-container',
    title: 'Your Claims',
    description:
      'Detected claims appear here as cards. Each card shows the claim text, verification status, and sources.',
    cardPosition: 'upper-center'
  },
  {
    targetSelector: '.menu-button',
    title: 'Open Settings',
    description: 'Click here to access app settings, theme toggle, and authentication options.',
    cardPosition: 'center-bottom'
  },
  {
    targetSelector: '.sidebar-item-theme',
    title: 'Switch Themes',
    description:
      'Toggle between light and dark mode. The app also follows your system preferences automatically.',
    cardPosition: 'center-right',
    requiresSidebar: true
  },
  {
    targetSelector: '.sidebar-item-auth',
    title: 'Authentication Mode',
    description: 'Switch between Google and API Key mode. API Key is recommended.',
    cardPosition: 'center-right',
    requiresSidebar: true
  },
  {
    targetSelector: '.sidebar-item-api-key',
    title: 'Manage API Key',
    description: 'If using API Key mode, click here to securely save your Google Gemini API key.',
    cardPosition: 'center-right',
    requiresSidebar: true
  },
  {
    targetSelector: '.sidebar-item-login',
    title: 'Login & Account',
    description: 'Sign in with your Google account or log out from here.',
    cardPosition: 'center-right',
    requiresSidebar: true
  }
]

interface WalkthroughProps {
  isOpen: boolean
  onClose: () => void
  onToggleSidebar?: (open: boolean) => void
}

export function Walkthrough({
  isOpen,
  onClose,
  onToggleSidebar
}: WalkthroughProps): React.JSX.Element | null {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  const step = WALKTHROUGH_STEPS[currentStep]

  // Handle sidebar state based on current step
  useEffect(() => {
    if (!isOpen || !step) return

    if (step.requiresSidebar) {
      onToggleSidebar?.(true)
    } else {
      // Small delay to allow sidebar to close smoothly before measuring
      const timer = setTimeout(() => {
        onToggleSidebar?.(false)
      }, 50)
      return () => clearTimeout(timer)
    }
    return
  }, [currentStep, isOpen, step, onToggleSidebar])

  // Update target element position
  const updateTargetRect = useCallback(() => {
    if (!step) return

    // If sidebar is involved, we need to track the element as it might be animating
    if (step.requiresSidebar) {
      const startTime = Date.now()
      const trackElement = () => {
        const element = document.querySelector(step.targetSelector)
        if (element) {
          setTargetRect(element.getBoundingClientRect())
        }

        // Continue tracking for 400ms (slightly longer than sidebar tracking duration)
        if (Date.now() - startTime < 400) {
          requestAnimationFrame(trackElement)
        }
      }
      requestAnimationFrame(trackElement)
    } else {
      // For non-sidebar elements, try to find it immediately, but retry if not found
      // This helps with initial load timing or other transitions
      const findElement = (retries = 0): void => {
        const element = document.querySelector(step.targetSelector)
        if (element) {
          setTargetRect(element.getBoundingClientRect())
        } else if (retries < 10) {
          // Retry for ~160ms if element not found immediately
          requestAnimationFrame(() => findElement(retries + 1))
        }
      }
      findElement()
    }
  }, [step])

  useEffect(() => {
    if (!isOpen) return

    updateTargetRect()
    window.addEventListener('resize', updateTargetRect)
    window.addEventListener('scroll', updateTargetRect)

    return () => {
      window.removeEventListener('resize', updateTargetRect)
      window.removeEventListener('scroll', updateTargetRect)
    }
  }, [isOpen, updateTargetRect]) // Removed currentStep dependency as it's handled by updateTargetRect callback update

  // Trigger update when step changes
  useEffect(() => {
    if (isOpen) {
      updateTargetRect()
    }
  }, [currentStep, isOpen, updateTargetRect])

  // Reset step when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0)
    } else {
      onToggleSidebar?.(false) // Ensure sidebar closes when walkthrough closes
    }
  }, [isOpen, onToggleSidebar])

  const handleNext = (): void => {
    if (currentStep < WALKTHROUGH_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1)
    } else {
      onClose()
    }
  }

  const handleBack = (): void => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  const handleSkip = (): void => {
    onClose()
  }

  if (!isOpen || !step || !targetRect) return null

  // Get the CSS class for card position
  let positionClass = ''
  if (step.cardPosition === 'center-bottom') positionClass = 'walkthrough-card-bottom'
  else if (step.cardPosition === 'center-right') positionClass = 'walkthrough-card-right'
  else positionClass = 'walkthrough-card-top'

  // Add shifted class if sidebar is required
  const shiftedClass = step.requiresSidebar ? 'shifted' : ''

  return (
    <div className="walkthrough-overlay">
      {/* Spotlight cutout using box-shadow */}
      <div
        className="walkthrough-spotlight"
        style={{
          top: targetRect.top - 8,
          left: targetRect.left - 8,
          width: targetRect.width + 16,
          height: targetRect.height + 16,
          borderRadius: targetRect.width === targetRect.height ? '50%' : '12px'
        }}
      />

      {/* Popup card */}
      <div className={`walkthrough-card ${positionClass} ${shiftedClass}`}>
        <div className="walkthrough-step-indicator">
          {currentStep + 1} of {WALKTHROUGH_STEPS.length}
        </div>
        <h3 className="walkthrough-title">{step.title}</h3>
        <p className="walkthrough-description">{step.description}</p>

        <div className="walkthrough-nav">
          <button className="walkthrough-btn walkthrough-btn-skip" onClick={handleSkip}>
            Skip
          </button>
          <div className="walkthrough-nav-main">
            {currentStep > 0 && (
              <button className="walkthrough-btn walkthrough-btn-back" onClick={handleBack}>
                Back
              </button>
            )}
            <button className="walkthrough-btn walkthrough-btn-next" onClick={handleNext}>
              {currentStep === WALKTHROUGH_STEPS.length - 1 ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Walkthrough
