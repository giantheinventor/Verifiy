import { useState, useRef, useEffect } from 'react'

export function AudioCapture(): React.JSX.Element {
    const [isCapturing, setIsCapturing] = useState(false)
    const [volume, setVolume] = useState(0)
    const [status, setStatus] = useState('')
    const streamRef = useRef<MediaStream | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
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
            setStatus('Requesting system audio...')

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
                setStatus('No audio track - check permissions')
                stream.getVideoTracks().forEach((t) => t.stop())
                return
            }

            audioTracks[0].addEventListener('ended', () => stopCapture())

            setStatus(`Capturing: ${audioTracks[0].label || 'System Audio'}`)
            streamRef.current = stream

            const audioContext = new AudioContext({ sampleRate: 48000 })
            if (audioContext.state === 'suspended') await audioContext.resume()

            const sourceNode = audioContext.createMediaStreamSource(stream)
            const analyser = audioContext.createAnalyser()
            analyser.fftSize = 2048
            analyser.smoothingTimeConstant = 0.3

            // Connect: source -> analyser -> silent gain -> destination
            const gainNode = audioContext.createGain()
            gainNode.gain.value = 0
            sourceNode.connect(analyser)
            analyser.connect(gainNode)
            gainNode.connect(audioContext.destination)

            audioContextRef.current = audioContext
            analyserRef.current = analyser

            setIsCapturing(true)
            updateVolume()
        } catch (e) {
            const error = e as DOMException
            let errorMessage = error.message || 'Unknown error'

            if (error.name === 'NotReadableError') {
                errorMessage = 'Grant Screen Recording permission in System Settings, then restart the app'
            } else if (error.name === 'NotAllowedError') {
                errorMessage = 'Permission denied'
            }

            setStatus(errorMessage)
        }
    }

    const stopCapture = (): void => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
        streamRef.current?.getTracks().forEach((t) => t.stop())
        audioContextRef.current?.close()

        streamRef.current = null
        audioContextRef.current = null
        analyserRef.current = null

        setIsCapturing(false)
        setVolume(0)
        setStatus('')
    }

    useEffect(() => {
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
            audioContextRef.current?.close()
        }
    }, [])

    return (
        <div
            style={{
                padding: '20px',
                background: '#1a1a1a',
                borderRadius: '12px',
                margin: '20px',
                color: '#fff'
            }}
        >
            <h3 style={{ margin: '0 0 15px' }}>System Audio</h3>

            {!isCapturing ? (
                <>
                    <button
                        onClick={startCapture}
                        style={{
                            padding: '10px 20px',
                            background: '#007AFF',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer'
                        }}
                    >
                        Start Capture
                    </button>
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '10px', lineHeight: '1.4' }}>
                        <div>⚠️ Play audio (music/video) to test capture</div>
                        <div style={{ marginTop: '5px' }}>💡 Run from terminal for proper permissions</div>
                    </div>
                </>
            ) : (
                <button
                    onClick={stopCapture}
                    style={{
                        padding: '10px 20px',
                        background: '#FF3B30',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                    }}
                >
                    Stop
                </button>
            )}

            {status && (
                <div style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>{status}</div>
            )}

            {isCapturing && (
                <div style={{ marginTop: '15px' }}>
                    <div
                        style={{ height: '10px', background: '#333', borderRadius: '5px', overflow: 'hidden' }}
                    >
                        <div
                            style={{
                                width: `${(volume / 255) * 100}%`,
                                height: '100%',
                                background: '#4CD964',
                                transition: 'width 0.05s'
                            }}
                        />
                    </div>
                    <div style={{ fontSize: '10px', color: '#555', marginTop: '5px', textAlign: 'right' }}>
                        {volume}
                    </div>
                </div>
            )}
        </div>
    )
}
