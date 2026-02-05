import type { Blob } from '@google/genai'

/**
 * Encodes Float32 audio data to 16-bit PCM for Gemini API.
 */
export function createPcmBlob(data: Float32Array): Blob {
  const l = data.length
  const int16 = new Int16Array(l)
  for (let i = 0; i < l; i++) {
    // Clamp values to [-1, 1] before scaling
    const sample = Math.max(-1, Math.min(1, data[i]))
    int16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }

  // Create a binary string from the Int16Array
  let binary = ''
  const bytes = new Uint8Array(int16.buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }

  return {
    data: btoa(binary),
    mimeType: 'audio/pcm;rate=16000'
  }
}

/**
 * Resamples audio buffer to target sample rate (16kHz).
 */
export function downsampleTo16k(buffer: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000) {
    return buffer
  }

  const compression = inputSampleRate / 16000
  const length = buffer.length / compression
  const result = new Float32Array(length)

  for (let i = 0; i < length; i++) {
    result[i] = buffer[Math.floor(i * compression)]
  }

  return result
}
