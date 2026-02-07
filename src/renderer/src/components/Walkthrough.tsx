import React, { useState, useEffect, useCallback } from 'react'

interface WalkthroughStep {
  targetSelector: string
  title: string
  description: string
  cardPosition: 'center-bottom' | 'upper-center'
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
    title: 'Switch Themes',
    description:
      'Toggle between light and dark mode. The app also follows your system preferences automatically.',
    cardPosition: 'upper-center'
  }
]

interface WalkthroughProps {
  isOpen: boolean
  onClose: () => void
}

export function Walkthrough({ isOpen, onClose }: WalkthroughProps): React.JSX.Element | null {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  const step = WALKTHROUGH_STEPS[currentStep]

  // Update target element position
  const updateTargetRect = useCallback(() => {
    if (!step) return
    const element = document.querySelector(step.targetSelector)
    if (element) {
      setTargetRect(element.getBoundingClientRect())
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
  }, [isOpen, updateTargetRect])

  // Reset step when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0)
    }
  }, [isOpen])

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
  const positionClass =
    step.cardPosition === 'center-bottom' ? 'walkthrough-card-bottom' : 'walkthrough-card-top'

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
      <div className={`walkthrough-card ${positionClass}`}>
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
