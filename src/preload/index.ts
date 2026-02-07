import { contextBridge, ipcRenderer, shell } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // --- OAuth & Auth ---
  startOAuth: () => ipcRenderer.send('start-oauth'),
  
  onAuthStatus: (callback) => {
    const subscription = (_event, status) => callback(status)
    ipcRenderer.on('auth-status', subscription)
    // Return a function to remove only THIS specific listener
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
  onGeminiData: (callback) => {
    const subscription = (_event, data) => callback(data)
    ipcRenderer.on('gemini-data', subscription)
    return () => ipcRenderer.removeListener('gemini-data', subscription)
  },

  // --- Fact Checking Results ---
  onFactCheckResult: (callback) => {
    const subscription = (_event, result) => callback(result)
    ipcRenderer.on('fact-check-result', subscription)
    return () => ipcRenderer.removeListener('fact-check-result', subscription)
  },

  // Utils
  openExternal: (url: string) => shell.openExternal(url)
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
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}