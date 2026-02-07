import { useState, useRef, useEffect } from 'react'
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
  const [volume, setVolume] = useState(0)

  // Refs for each stream
  const micStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)

  // Refs for audio nodes
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const mergerRef = useRef<ChannelMergerNode | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const screenSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const micGainRef = useRef<GainNode | null>(null)
  const screenGainRef = useRef<GainNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const updateVolume = (): void => {
    if (!analyserRef.current) return

    const dataArray = new Uint8Array(analyserRef.current.fftSize)
    analyserRef.current.getByteTimeDomainData(dataArray)

    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128
      sum += normalized * normalized
    }
    const rms = Math.sqrt(sum / dataArray.length)
    const volumeLevel = Math.min(255, Math.round(rms * 255))

    const freqArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(freqArray)
    let maxFreq = 0
    for (let i = 0; i < freqArray.length; i++) {
      if (freqArray[i] > maxFreq) maxFreq = freqArray[i]
    }

    setVolume(Math.max(volumeLevel, maxFreq))
    animationFrameRef.current = requestAnimationFrame(updateVolume)
  }

  // Initialize audio context and shared nodes
  const initAudioContext = (): AudioContext => {
    if (audioContextRef.current) return audioContextRef.current

    const audioContext = new AudioContext({ sampleRate: 48000 })

    // Create merger for combining sources
    const merger = audioContext.createChannelMerger(2)
    mergerRef.current = merger

    // Create analyser
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.3
    analyserRef.current = analyser

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

    // Connect: merger -> analyser -> processor -> silentGain -> destination
    merger.connect(analyser)
    analyser.connect(processor)
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

      if (!animationFrameRef.current) {
        updateVolume()
      }
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

      if (!animationFrameRef.current) {
        updateVolume()
      }
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
    analyserRef.current = null
    audioContextRef.current?.close()
    audioContextRef.current = null

    setVolume(0)
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
      style={{ display: 'flex', alignItems: 'center', gap: '20px' }}
    >
      <button
        className={`mic-button audio-capture-btn ${isListening ? 'listening' : ''}`}
        onClick={handleClick}
        aria-label={isListening ? 'Stop listening' : 'Start listening'}
      >
        {/* Soundwave icon - always the same */}
        <Icons.Soundwave size={80} />
      </button>

      {/* Volume Meter */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '5px'
        }}
      >
        <div
          style={{
            width: '20px',
            height: '150px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '10px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column-reverse'
          }}
        >
          <div
            style={{
              width: '100%',
              height: `${(volume / 255) * 100}%`,
              background: volume > 200 ? '#FF3B30' : volume > 100 ? '#FFCC00' : '#4CD964',
              transition: 'height 0.05s, background 0.1s',
              borderRadius: '10px'
            }}
          />
        </div>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{volume}</span>
      </div>
    </div>
  )
}
