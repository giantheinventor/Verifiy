import { useState, useRef, useEffect } from 'react'
import { downsampleTo16k, createPcmBlob } from '../utils/audioUtils'
import type { Blob as GeminiBlob } from '@google/genai'

interface AudioCaptureProps {
    isListening: boolean
    onClick: () => void
    mode: 'screen' | 'mic'
    onAudioData?: (blob: GeminiBlob) => void
}

export function AudioCapture({ isListening, onClick, mode, onAudioData }: AudioCaptureProps): React.JSX.Element {
    const [volume, setVolume] = useState(0)
    const streamRef = useRef<MediaStream | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const processorRef = useRef<ScriptProcessorNode | null>(null)
    const animationFrameRef = useRef<number | null>(null)

    const updateVolume = (): void => {
        if (!analyserRef.current) return

        const dataArray = new Uint8Array(analyserRef.current.fftSize)
        analyserRef.current.getByteTimeDomainData(dataArray)

        // Calculate RMS for volume level
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
            const normalized = (dataArray[i] - 128) / 128
            sum += normalized * normalized
        }
        const rms = Math.sqrt(sum / dataArray.length)
        const volumeLevel = Math.min(255, Math.round(rms * 255))

        // Also check frequency data
        const freqArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(freqArray)
        let maxFreq = 0
        for (let i = 0; i < freqArray.length; i++) {
            if (freqArray[i] > maxFreq) maxFreq = freqArray[i]
        }

        setVolume(Math.max(volumeLevel, maxFreq))
        animationFrameRef.current = requestAnimationFrame(updateVolume)
    }

    const startCapture = async (): Promise<void> => {
        try {
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
                stream.getVideoTracks().forEach((t) => t.stop())
                return
            }

            audioTracks[0].addEventListener('ended', () => stopCapture())

            streamRef.current = stream

            const audioContext = new AudioContext({ sampleRate: 48000 })
            if (audioContext.state === 'suspended') await audioContext.resume()

            const sourceNode = audioContext.createMediaStreamSource(stream)
            const analyser = audioContext.createAnalyser()
            analyser.fftSize = 2048
            analyser.smoothingTimeConstant = 0.3

            // Create ScriptProcessorNode for audio data capture (4096 samples buffer)
            const processor = audioContext.createScriptProcessor(4096, 1, 1)
            processor.onaudioprocess = (event): void => {
                if (onAudioData) {
                    const inputData = event.inputBuffer.getChannelData(0)
                    const downsampled = downsampleTo16k(inputData, audioContext.sampleRate)
                    const pcmBlob = createPcmBlob(downsampled)
                    onAudioData(pcmBlob)
                }
            }

            // Connect: source -> analyser -> processor -> silent gain -> destination
            const gainNode = audioContext.createGain()
            gainNode.gain.value = 0
            sourceNode.connect(analyser)
            analyser.connect(processor)
            processor.connect(gainNode)
            gainNode.connect(audioContext.destination)

            audioContextRef.current = audioContext
            analyserRef.current = analyser
            processorRef.current = processor

            updateVolume()
        } catch (e) {
            console.error('Audio capture error:', e)
        }
    }

    const stopCapture = (): void => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
        if (processorRef.current) {
            processorRef.current.disconnect()
            processorRef.current = null
        }
        streamRef.current?.getTracks().forEach((t) => t.stop())
        audioContextRef.current?.close()

        streamRef.current = null
        audioContextRef.current = null
        analyserRef.current = null

        setVolume(0)
    }

    // Start/stop capture based on isListening prop
    useEffect(() => {
        if (isListening) {
            startCapture()
        } else {
            stopCapture()
        }
    }, [isListening])

    useEffect(() => {
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
            audioContextRef.current?.close()
        }
    }, [])

    const handleClick = (): void => {
        onClick()
    }

    return (
        <div className="audio-capture-container" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <button
                className={`mic-button ${isListening ? 'listening' : ''}`}
                onClick={handleClick}
                aria-label={isListening ? 'Stop listening' : 'Start listening'}
            >
                {mode === 'mic' ? (
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                ) : (
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                )}
            </button>

            {/* Volume Meter for Testing */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '5px'
            }}>
                <div style={{
                    width: '20px',
                    height: '150px',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column-reverse'
                }}>
                    <div style={{
                        width: '100%',
                        height: `${(volume / 255) * 100}%`,
                        background: volume > 200 ? '#FF3B30' : volume > 100 ? '#FFCC00' : '#4CD964',
                        transition: 'height 0.05s, background 0.1s',
                        borderRadius: '10px'
                    }} />
                </div>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{volume}</span>
            </div>
        </div>
    )
}
