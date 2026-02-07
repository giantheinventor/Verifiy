import { safeStorage, app, BrowserWindow } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// OAuth Configuration (from .env, must match index.ts)
const CLIENT_ID = process.env.CLIENT_ID || ''
const CLIENT_SECRET = process.env.CLIENT_SECRET || ''

// Token refresh buffer (refresh 5 minutes before expiry)
const REFRESH_BUFFER_MS = 5 * 60 * 1000
const TOKEN_FILE_NAME = 'secure_tokens.enc'

interface TokenData {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export class TokenManager {
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private expiresAt: number | null = null
  private refreshTimer: NodeJS.Timeout | null = null
  private mainWindow: BrowserWindow | null = null
  private storagePath: string

  constructor() {
    // Determine path for secure storage file
    this.storagePath = join(app.getPath('userData'), TOKEN_FILE_NAME)
    // Try to load refresh token from secure storage on init
    this.loadRefreshToken()
  }

  /**
   * Set the main window reference for IPC communication
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  /**
   * Store tokens from OAuth response
   */
  storeTokens(tokenData: TokenData): void {
    this.accessToken = tokenData.access_token
    // Set expiration based on current time
    this.expiresAt = Date.now() + (tokenData.expires_in * 1000)

    // Important: Only update refresh token if a new one is returned
    // (Google sometimes doesn't send it on simple refreshs)
    if (tokenData.refresh_token) {
      this.refreshToken = tokenData.refresh_token
      this.saveRefreshToken(tokenData.refresh_token)
    }

    console.log(`[TokenManager] Token stored. Expires at: ${new Date(this.expiresAt).toISOString()}`)

    // Schedule automatic refresh
    this.scheduleRefresh()
  }

  /**
   * CRITICAL for Agent: Get a valid token, refreshing if necessary
   */
  async getValidToken(): Promise<string | null> {
    // Case 1: No credentials at all
    if (!this.accessToken && !this.refreshToken) {
      console.warn('[TokenManager] No tokens available')
      return null
    }

    // Case 2: Token is expiring soon or expired -> Refresh it now
    if (this.isExpiringSoon()) {
      console.log('[TokenManager] Token expired/expiring during retrieval. Refreshing...')
      return await this.refreshAccessToken()
    }

    // Case 3: Token is fine
    return this.accessToken
  }

  /**
   * Get current access token (raw)
   */
  getAccessToken(): string | null {
    return this.accessToken
  }

  /**
   * Check if token is about to expire (within buffer period)
   */
  isExpiringSoon(): boolean {
    if (!this.expiresAt) return true
    return Date.now() > (this.expiresAt - REFRESH_BUFFER_MS)
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshAccessToken(): Promise<string | null> {
    if (!this.refreshToken) {
      console.log('[TokenManager] No refresh token available for refresh')
      return null
    }

    console.log('[TokenManager] Refreshing access token...')

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[TokenManager] Refresh failed:', response.status, errorText)
        
        // If refresh fails (e.g. revoked), clear everything
        if (response.status === 400 || response.status === 401) {
          this.clearTokens()
        }
        return null
      }

      const tokenData = (await response.json()) as TokenData
      
      // Update internal state
      this.storeTokens(tokenData)

      // Notify renderer (optional, but good for UI state)
      this.notifyTokenRefreshed()

      return this.accessToken
    } catch (error) {
      console.error('[TokenManager] Token refresh error:', error)
      return null
    }
  }

  /**
   * Schedule automatic token refresh before expiry
   */
  private scheduleRefresh(): void {
    // Clear existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }

    if (!this.expiresAt || !this.refreshToken) return

    // Calculate time until refresh
    const timeUntilRefresh = this.expiresAt - Date.now() - REFRESH_BUFFER_MS

    if (timeUntilRefresh <= 0) {
      // Already overdue? Refresh immediately (async)
      this.refreshAccessToken()
    } else {
      console.log(`[TokenManager] Scheduling background refresh in ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`)
      this.refreshTimer = setTimeout(() => {
        this.refreshAccessToken()
      }, timeUntilRefresh)
    }
  }

  /**
   * Save refresh token to secure storage (Disk)
   */
  private saveRefreshToken(token: string): void {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(token)
        writeFileSync(this.storagePath, encrypted)
        console.log('[TokenManager] Refresh token encrypted and saved to disk')
      } else {
        console.warn('[TokenManager] Encryption not available! Cannot save secure token.')
      }
    } catch (error) {
      console.error('[TokenManager] Failed to save refresh token:', error)
    }
  }

  /**
   * Load refresh token from secure storage (Disk)
   */
  private loadRefreshToken(): void {
    try {
      if (!existsSync(this.storagePath)) {
        console.log('[TokenManager] No saved token found.')
        return
      }

      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = readFileSync(this.storagePath)
        const decrypted = safeStorage.decryptString(encrypted)
        
        this.refreshToken = decrypted
        console.log('[TokenManager] Refresh token loaded and decrypted from disk.')
        
        // Immediately try to get a fresh access token using this refresh token
        this.refreshAccessToken()
      }
    } catch (error) {
      console.error('[TokenManager] Failed to load refresh token:', error)
      // If file is corrupt, delete it
      try { unlinkSync(this.storagePath) } catch {}
    }
  }

  /**
   * Notify renderer process of token refresh
   */
  private notifyTokenRefreshed(): void {
    if (this.mainWindow && this.accessToken) {
      // Send just status update, not the token itself (security)
      this.mainWindow.webContents.send('auth-status', { success: true, type: 'refresh' })
    }
  }

  /**
   * Clear all tokens (logout)
   */
  clearTokens(): void {
    this.accessToken = null
    this.refreshToken = null
    this.expiresAt = null

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
    
    // Remove file from disk
    try {
      if (existsSync(this.storagePath)) {
        unlinkSync(this.storagePath)
      }
    } catch (e) { console.error(e) }

    console.log('[TokenManager] Tokens cleared and storage wiped')
    
    // Notify UI
    if (this.mainWindow) {
      this.mainWindow.webContents.send('auth-status', { success: false, error: 'Logged out' })
    }
  }
}

// Singleton instance
export const tokenManager = new TokenManager()