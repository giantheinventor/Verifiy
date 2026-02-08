import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  session,
  desktopCapturer,
  screen
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initMain } from 'electron-audio-loopback'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { randomBytes, createHash } from 'crypto'
import { tokenManager } from './tokenManager'
import { ListeningAgent, runFactCheck, closeAllAgents } from './geminiService'

// Initialize electron-audio-loopback before app.whenReady
initMain()

// --- OAuth Configuration (from .env) ---
const CLIENT_ID = import.meta.env.MAIN_VITE_CLIENT_ID || ''
const CLIENT_SECRET = import.meta.env.MAIN_VITE_CLIENT_SECRET || ''


// Store main window reference for IPC
let mainWindow: BrowserWindow | null = null
let oauthServer: Server | null = null

// PKCE state
let codeVerifier: string | null = null
let oauthState: string | null = null
let codeChallenge: string | null = null 

// HINWEIS: `storedAccessToken` wurde ENTFERNT. Wir nutzen nur den tokenManager.

// --- Active Listening Agent Session ---
let listeningAgent: ListeningAgent | null = null

// --- PKCE Helper Functions ---

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

function generateState(): string {
  return randomBytes(16).toString('base64url')
}

// --- OAuth Loopback Server ---

async function startOAuthFlow(): Promise<void> {
  if (oauthServer) {
    oauthServer.close()
    oauthServer = null
  }

  return new Promise((resolve) => {
    oauthServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://127.0.0.1`)

      if (url.pathname !== '/') {
        res.writeHead(404)
        res.end('Not found')
        return
      }

      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      const returnedState = url.searchParams.get('state')

      // Verify state
      if (returnedState !== oauthState) {
        console.error('State mismatch! Possible CSRF attack.')
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end('<h1>Security Error</h1><p>State mismatch.</p>')
        oauthServer?.close()
        return
      }

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`<h1>Authentication Failed</h1><p>${error}</p>`)
        oauthServer?.close()
        return
      }

      if (!code) {
        res.writeHead(400)
        res.end('No authorization code received')
        return
      }

      const address = oauthServer?.address() as AddressInfo
      const redirectUri = `http://127.0.0.1:${address.port}`

      try {
        const tokenData = await exchangeCodeForToken(code, redirectUri, codeVerifier!)

        if (tokenData && mainWindow) {
          // HINWEIS: Speichern im Manager (löst Auto-Refresh aus)
          tokenManager.storeTokens(tokenData)
          
          // HINWEIS: Alte storedAccessToken Zuweisung entfernt!
          console.log('OAuth token stored in TokenManager')
          
          mainWindow.webContents.send('auth-status', { success: true, type: 'oauth' })
          mainWindow.focus()
        }

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`<script>window.close()</script><h1>Login Successful!</h1>`)
      } catch (err) {
        console.error('Token exchange failed:', err)
        res.writeHead(500, { 'Content-Type': 'text/html' })
        res.end('<h1>Token Exchange Failed</h1>')
      }

      oauthServer?.close()
      oauthServer = null
    })

    oauthServer.listen(0, '127.0.0.1', () => {
      const address = oauthServer?.address() as AddressInfo
      const port = address.port
      const redirectUri = `http://127.0.0.1:${port}`

      codeVerifier = generateCodeVerifier()
      codeChallenge = generateCodeChallenge(codeVerifier)
      oauthState = generateState()

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', CLIENT_ID)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      // Scope update: Google Search & Gemini
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/generative-language.retriever https://www.googleapis.com/auth/generative-language.peruserquota') 
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')
      authUrl.searchParams.set('code_challenge', codeChallenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      authUrl.searchParams.set('state', oauthState)

      shell.openExternal(authUrl.toString())
      resolve()
    })
  })
}

interface TokenData {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

/**
 * Exchanges the authorization code for access and refresh tokens.
 * Uses PKCE (Proof Key for Code Exchange).
 */
async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  verifier: string
): Promise<TokenData | null> {
  console.log('Exchanging auth code for token...');

  try {
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('code', code);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', redirectUri);
    params.append('code_verifier', verifier); // PKCE: proves we initiated the auth request

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token exchange failed:', response.status, errorText);
      return null;
    }

    const data = (await response.json()) as TokenData;
    return data;
  } catch (error) {
    console.error('Token exchange error:', error);
    return null;
  }
}

// --- Window Creation ---

function createWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  const windowWidth = Math.round(screenWidth / 3)
  const windowHeight = Math.round((screenHeight * 4) / 5)

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    autoHideMenuBar: true,
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow!.show())

  mainWindow.on('closed', () => {
    mainWindow = null
    closeAllAgents() // Sicherstellen, dass Agents sterben wenn Fenster zugeht
    if (oauthServer) {
      oauthServer.close()
      oauthServer = null
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      const screenSource = sources.find((s) => s.id.startsWith('screen:')) || sources[0]
      callback({ video: screenSource, audio: 'loopback' })
    } catch (error) {
      console.error('Display media handler error:', error)
      callback({ audio: 'loopback' })
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  
  // CSP Header (bleibt gleich)
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "connect-src 'self' https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com https://*.googleapis.com; " +
            "img-src 'self' data: blob:;"
        ]
      }
    })
  })
}

// --- App Lifecycle ---

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.verify.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('start-oauth', async () => {
    try { await startOAuthFlow() } catch (error) { console.error('Failed to start OAuth flow:', error) }
  })
  
  // --- Session Management IPC Handlers ---
  
  ipcMain.on('start-session', async () => {
    console.log('Received start-session IPC')
    
    // Disconnect any existing session
    if (listeningAgent) {
      listeningAgent.disconnect()
      listeningAgent = null
    }
    
    // HINWEIS: WICHTIGSTE ÄNDERUNG!
    // Wir holen den Token ASYNCHRON. Das prüft auf Ablauf und refresht ihn ggf.
    const accessToken = await tokenManager.getValidToken()

    if (!accessToken) {
      console.error('No valid OAuth token available')
      if (mainWindow) {
        mainWindow.webContents.send('gemini-data', { 
          type: 'error', 
          data: { message: 'Session expired or not logged in. Please login again.' } 
        })
      }
      return
    }
    
    if (!mainWindow) return
    
    try {
      // Create listening agent with valid token
      listeningAgent = new ListeningAgent(accessToken)
      listeningAgent.setMainWindow(mainWindow)
      
      // Events
      listeningAgent.on('setup_complete', (data) => {
        mainWindow?.webContents.send('gemini-data', { type: 'setup_complete', data })
      })
      
      listeningAgent.on('claim_detected', (data) => {
        console.log('Claim detected:', data)
        // Note: ListeningAgent already sends 'tool_call' event to renderer via notifyRenderer
        
        // Auto-Start Fact Checking
        const toolData = data as { args: { claim_title?: string; claim_text?: string } }
        const claimText = toolData.args?.claim_text
        const claimTitle = toolData.args?.claim_title || 'Claim'
        
        if (claimText) {
          // 1. Notify UI: "Verifying..."
          mainWindow?.webContents.send('fact-check-status', { title: claimTitle, status: 'verifying' })

          // 2. Run Fact-Check via REST (async)
          console.log('[Main] Claim detected, getting token for REST check...')
          // Look up fresh token
          tokenManager.getValidToken().then(async (token) => {
            if (!token) {
               console.error('[Main] No valid token found for fact check')
               return
            }
            
            console.log(`[Main] Starting fact check for: "${claimTitle}"`)
            try {
              const result = await runFactCheck(claimText, token)
              console.log('[Main] Fact check complete:', JSON.stringify(result))
              
              // 3. Send result to UI
              console.log('[Main] Sending fact-check-result to, renderer')
              mainWindow?.webContents.send('fact-check-result', {
                claimTitle,
                result: result // result is already the parsed object
              })
            } catch (error) {
              console.error("[Main] Fact Check Error:", error)
              mainWindow?.webContents.send('fact-check-result', {
                claimTitle,
                error: (error as Error).message
              })
            }
          })
        }
      })
      
      listeningAgent.on('server_content', (data) => mainWindow?.webContents.send('gemini-data', { type: 'server_content', data }))
      listeningAgent.on('message', (data) => mainWindow?.webContents.send('gemini-data', { type: 'content', data }))
      listeningAgent.on('error', (error) => mainWindow?.webContents.send('gemini-data', { type: 'error', data: { message: error.message } }))
      
      listeningAgent.on('close', (data) => {
        mainWindow?.webContents.send('gemini-data', { type: 'closed', data })
        listeningAgent = null
      })
      
      listeningAgent.connect()
      
    } catch (error) {
      console.error('Failed to start listening agent:', error)
      mainWindow.webContents.send('gemini-data', { 
        type: 'error', 
        data: { message: (error as Error).message || 'Failed to connect' } 
      })
      listeningAgent = null
    }
  })
  
  ipcMain.on('stop-session', () => {
    if (listeningAgent) {
      listeningAgent.disconnect()
      listeningAgent = null
      mainWindow?.webContents.send('gemini-data', { type: 'stopped', data: {} })
    }
  })
  
  ipcMain.on('audio-chunk', (_event, { chunk, mimeType }) => {
    if (listeningAgent) {
      listeningAgent.sendAudio(chunk, mimeType)
    }
  })

  createWindow()
  
  if (mainWindow) {
    tokenManager.setMainWindow(mainWindow)
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (oauthServer) { oauthServer.close(); oauthServer = null; }
  closeAllAgents()
  if (process.platform !== 'darwin') app.quit()
})