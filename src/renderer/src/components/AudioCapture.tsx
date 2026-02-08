import { useRef, useEffect } from 'react'
import { downsampleTo16k, createPcmBlob } from '../utils/audioUtils'
import Icons from './Icons'
import type { Blob as GeminiBlob } from '@google/genai'

interface AudioCaptureProps {
  isListening: boolean
  onClick: () => void
  inputMode: 'screen' | 'mic' | 'both' | 'none'
  onAudioData?: (blob: GeminiBlob) => void
}

export function AudioCapture({
  isListening,
  onClick,
  inputMode,
  onAudioData
}: AudioCaptureProps): React.JSX.Element {


  // Refs for each stream
  const micStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)

  // Refs for audio nodes
  const audioContextRef = useRef<AudioContext | null>(null)
  /* Analyser removed */
  // const analyserRef = useRef<AnalyserNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const mergerRef = useRef<ChannelMergerNode | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const screenSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const micGainRef = useRef<GainNode | null>(null)
  const screenGainRef = useRef<GainNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)



  // Initialize audio context and shared nodes
  const initAudioContext = (): AudioContext => {
    if (audioContextRef.current) return audioContextRef.current

    const audioContext = new AudioContext({ sampleRate: 48000 })

    // Create merger for combining sources
    const merger = audioContext.createChannelMerger(2)
    mergerRef.current = merger

    // Create processor for sending to Gemini
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (event): void => {
      if (onAudioData) {
        const inputData = event.inputBuffer.getChannelData(0)
        const downsampled = downsampleTo16k(inputData, audioContext.sampleRate)
        const pcmBlob = createPcmBlob(downsampled)
        onAudioData(pcmBlob)
      }
    }
    processorRef.current = processor

    // Create silent output
    const silentGain = audioContext.createGain()
    silentGain.gain.value = 0

    // Connect: merger -> processor -> silentGain -> destination
    merger.connect(processor)
    processor.connect(silentGain)
    silentGain.connect(audioContext.destination)

    audioContextRef.current = audioContext
    return audioContext
  }

  const startMicCapture = async (): Promise<void> => {
    if (micStreamRef.current) return // Already capturing

    try {
      const audioContext = initAudioContext()
      if (audioContext.state === 'suspended') await audioContext.resume()

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      audioTracks[0].addEventListener('ended', () => stopMicCapture())

      micStreamRef.current = stream

      // Create source and gain for mic
      const micSource = audioContext.createMediaStreamSource(stream)
      const micGain = audioContext.createGain()
      micGain.gain.value = 1.0

      micSource.connect(micGain)
      micGain.connect(mergerRef.current!, 0, 0) // Connect to left channel

      micSourceRef.current = micSource
      micGainRef.current = micGain


    } catch (e) {
      console.error('Mic capture error:', e)
    }
  }

  const stopMicCapture = (): void => {
    micSourceRef.current?.disconnect()
    micGainRef.current?.disconnect()
    micStreamRef.current?.getTracks().forEach((t) => t.stop())

    micSourceRef.current = null
    micGainRef.current = null
    micStreamRef.current = null
  }

  const startScreenCapture = async (): Promise<void> => {
    if (screenStreamRef.current) return // Already capturing

    try {
      const audioContext = initAudioContext()
      if (audioContext.state === 'suspended') await audioContext.resume()

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' as const },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } as MediaTrackConstraints
      })

      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      audioTracks[0].addEventListener('ended', () => stopScreenCapture())

      screenStreamRef.current = stream

      // Create source and gain for screen
      const screenSource = audioContext.createMediaStreamSource(stream)
      const screenGain = audioContext.createGain()
      screenGain.gain.value = 1.0

      screenSource.connect(screenGain)
      screenGain.connect(mergerRef.current!, 0, 1) // Connect to right channel

      screenSourceRef.current = screenSource
      screenGainRef.current = screenGain


    } catch (e) {
      console.error('Screen capture error:', e)
    }
  }

  const stopScreenCapture = (): void => {
    screenSourceRef.current?.disconnect()
    screenGainRef.current?.disconnect()
    screenStreamRef.current?.getTracks().forEach((t) => t.stop())

    screenSourceRef.current = null
    screenGainRef.current = null
    screenStreamRef.current = null
  }

  const stopAllCapture = (): void => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    stopMicCapture()
    stopScreenCapture()

    processorRef.current?.disconnect()
    processorRef.current = null
    mergerRef.current?.disconnect()
    mergerRef.current = null

    audioContextRef.current?.close()
    audioContextRef.current = null
  }

  // Derive enabled states from inputMode
  const micEnabled = inputMode === 'mic' || inputMode === 'both'
  const screenEnabled = inputMode === 'screen' || inputMode === 'both'

  // Handle mic enable/disable
  useEffect(() => {
    if (isListening && micEnabled) {
      startMicCapture()
    } else {
      stopMicCapture()
    }
  }, [isListening, micEnabled])

  // Handle screen enable/disable
  useEffect(() => {
    if (isListening && screenEnabled) {
      startScreenCapture()
    } else {
      stopScreenCapture()
    }
  }, [isListening, screenEnabled])

  // Stop all when not listening
  useEffect(() => {
    if (!isListening) {
      stopAllCapture()
    }
  }, [isListening])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllCapture()
    }
  }, [])

  const handleClick = (): void => {
    onClick()
  }

  return (
    <div
      className="audio-capture-container"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <button
        className={`mic-button audio-capture-btn ${isListening ? 'listening' : ''}`}
        onClick={handleClick}
        aria-label={isListening ? 'Stop listening' : 'Start listening'}
      >
        {/* Soundwave icon - always the same */}
        <Icons.Soundwave size={80} />
      </button>
    </div>
  )
}
