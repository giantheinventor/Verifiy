import { contextBridge, ipcRenderer, shell, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Types for IPC callbacks
interface AuthStatus {
  success: boolean
  type: string
  error?: string
}

interface GeminiData {
  type: 'setup_complete' | 'tool_call' | 'server_content' | 'error' | 'closed' | 'stopped'
  data: unknown
}

interface FactCheckResult {
  claimTitle: string
  result?: {
    verdict: 'True' | 'False' | 'Unverified' | 'Mixed'
    explanation: string
    score: number
    sources?: { title: string; uri: string }[]
  }
  error?: string
}

const api = {
  // --- OAuth & Auth ---
  startOAuth: (): void => ipcRenderer.send('start-oauth'),

  onAuthStatus: (callback: (status: AuthStatus) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, status: AuthStatus): void => callback(status)
    ipcRenderer.on('auth-status', subscription)
    return () => ipcRenderer.removeListener('auth-status', subscription)
  },

  // --- Session Control ---
  startSession: () => ipcRenderer.send('start-session'),
  stopSession: () => ipcRenderer.send('stop-session'),

  // --- Audio Pipeline ---
  // Matches your index.ts: ipcMain.on('audio-chunk', (_event, { chunk, mimeType }) => ...)
  sendAudioChunk: (chunk: string, mimeType?: string) => {
    ipcRenderer.send('audio-chunk', { chunk, mimeType })
  },

  // --- Gemini Feedback ---
  onGeminiData: (callback: (data: GeminiData) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, data: GeminiData): void => callback(data)
    ipcRenderer.on('gemini-data', subscription)
    return () => ipcRenderer.removeListener('gemini-data', subscription)
  },

  // --- Fact Checking Results ---
  onFactCheckResult: (callback: (result: FactCheckResult) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, result: FactCheckResult): void =>
      callback(result)
    ipcRenderer.on('fact-check-result', subscription)
    return () => ipcRenderer.removeListener('fact-check-result', subscription)
  },

  // Utils - with URL validation to prevent protocol injection
  openExternal: (url: string) => {
    try {
      const parsed = new URL(url)
      if (['http:', 'https:'].includes(parsed.protocol)) {
        shell.openExternal(url)
      } else {
        console.warn(`Blocked openExternal for unsafe protocol: ${parsed.protocol}`)
      }
    } catch {
      console.error('Invalid URL passed to openExternal:', url)
    }
  }
}

// Expose the APIs
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error - Fallback for non-isolated context (legacy Electron)
  window.electron = electronAPI
  // @ts-expect-error - Fallback for non-isolated context (legacy Electron)
  window.api = api
}