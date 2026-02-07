import { ElectronAPI } from '@electron-toolkit/preload'

// Define the shape of your custom Gemini API
interface GeminiAPI {
  // Auth Flow
  startOAuth: () => void
  onAuthStatus: (
    callback: (status: { success: boolean; type: string; error?: string }) => void
  ) => () => void

  // Session Management
  startSession: () => void
  stopSession: () => void

  // Audio Pipeline
  sendAudioChunk: (chunk: string, mimeType?: string) => void

  // Gemini Data Listeners
  onGeminiData: (
    callback: (data: { type: string; data: any }) => void
  ) => () => void
  
  onFactCheckResult: (
    callback: (result: { 
      claimTitle: string; 
      claimText: string; 
      result?: any; 
      error?: string 
    }) => void
  ) => () => void

  // Utilities
  openExternal: (url: string) => void
}

// Extend the global Window interface
declare global {
  interface Window {
    electron: ElectronAPI
    api: GeminiAPI
  }
}