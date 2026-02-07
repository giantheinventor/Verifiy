import { GoogleGenAI, Type, Modality } from '@google/genai'
import type { FunctionDeclaration } from '@google/genai'

// --- Authentication Management ---

// Module-level client instance
let ai: GoogleGenAI | null = null

// Store credentials for reference
let storedApiKey: string | null = null
let storedOAuthToken: string | null = null
let currentMode: 'apiKey' | 'oauth' | null = null

// Get current auth mode
export function getCurrentAuthMode(): 'apiKey' | 'oauth' | null {
  if (!ai) return null
  return currentMode
}

/**
 * Get authorization headers for REST/WebSocket requests
 * - OAuth: Returns { Authorization: 'Bearer <token>' }
 * - API Key: Returns empty object (use query param instead)
 */
export function getAuthHeaders(): Record<string, string> {
  if (currentMode === 'oauth' && storedOAuthToken) {
    return { 'Authorization': `Bearer ${storedOAuthToken}` }
  }
  return {}
}

/**
 * Get auth query parameter for API key mode
 * - API Key: Returns '?key=<apiKey>'
 * - OAuth: Returns empty string (use header instead)
 */
export function getAuthQueryParam(): string {
  if (currentMode === 'apiKey' && storedApiKey) {
    return `?key=${storedApiKey}`
  }
  return ''
}

/**
 * Get the current access token (for WebSocket proxy)
 */
export function getAccessToken(): string | null {
  if (currentMode === 'oauth') {
    return storedOAuthToken
  }
  return null
}

/**
 * Update the OAuth token (called when token is refreshed)
 * Re-instantiates the client since GoogleGenAI headers are immutable after creation
 */
export function updateOAuthToken(newToken: string): void {
  storedOAuthToken = newToken
  
  // Always re-instantiate client if OAuth mode is active
  // This is required because the SDK's headers are immutable after creation
  if (currentMode === 'oauth') {
    ai = createOAuthClient(newToken)
    console.log('OAuth client re-instantiated with new token')
  } else {
    // Store token for later use when switching to OAuth mode
    console.log('OAuth token stored (API key mode active)')
  }
}

/**
 * Connect/reconnect to Gemini using API key
 * @param apiKey The API key provided by the user
 * @returns true if successful
 */
export function connectWithApiKey(apiKey: string): boolean {
  if (!apiKey) {
    console.error('No API key provided')
    return false
  }
  
  console.log('Connecting to Gemini with API key...')
  ai = new GoogleGenAI({ apiKey: apiKey })
  storedApiKey = apiKey
  currentMode = 'apiKey'
  console.log('Connected with API key')
  return true
}

/**
 * Create a GoogleGenAI client configured for OAuth
 * Uses requestOptions.customHeaders for Authorization header
 */
function createOAuthClient(accessToken: string): GoogleGenAI {
  return new GoogleGenAI({
    // SDK requires apiKey field, but we override auth with customHeaders
    apiKey: 'OAUTH_CREDENTIAL',
    httpOptions: {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  })
}

/**
 * Connect/reconnect to Gemini using OAuth access token
 * Uses Authorization: Bearer header instead of API key
 * @param accessToken The OAuth access token
 * @returns true if successful
 */
export function connectWithOAuth(accessToken: string): boolean {
  if (!accessToken) {
    console.error('No OAuth token provided')
    return false
  }
  
  console.log('Connecting to Gemini with OAuth token (using Authorization header)...')
  ai = createOAuthClient(accessToken)
  storedOAuthToken = accessToken
  currentMode = 'oauth'
  console.log('Connected with OAuth token')
  return true
}

/**
 * Check if the client is initialized
 */
export function isInitialized(): boolean {
  return ai !== null
}

// --- Helper Functions ---

// Get the current AI client (throws if not initialized)
function getClient(): GoogleGenAI {
  if (!ai) {
    throw new Error('Gemini client not initialized. Call connectWithApiKey() or connectWithOAuth() first.')
  }
  return ai
}

// --- Fact Check Verification Service ---

interface VerificationResult {
  verdict: 'True' | 'False' | 'Unverified' | 'Mixed'
  score: number
  explanation: string
}

export async function verifyClaimWithSearch(
  claimText: string
): Promise<{ result: VerificationResult; sources: { title: string; uri: string }[] }> {
  const maxRetries = 3
  let lastError: unknown = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const model = 'gemini-2.5-flash-preview-09-2025'

      const prompt = `
        Fact check the following claim: "${claimText}".
        Use Google Search to find recent and relevant sources.
        Use trusted sources only. MAKE SURE to use only sources and do not infer things based on the claim.
        
        Return ONLY a JSON object (no markdown, no explanation outside the JSON) with exactly these fields:
        {
          "verdict": "True" | "False"  | "Unverified" | "Mixed",
          "score": 1-5 (integer, 1=Totally False, 5=Totally True),
          "explanation": "A concise (max 2 sentences) explanation"
        }
        use the language of the claim
      `

      const response = await getClient().models.generateContent({
        model: model,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      })

      const responseText = response.text || '{}'
      
      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      const jsonText = jsonMatch ? jsonMatch[0] : '{}'
      
      const result = JSON.parse(jsonText) as VerificationResult

      // Debug: Log grounding metadata
      console.log('Grounding metadata:', JSON.stringify(response.candidates?.[0]?.groundingMetadata, null, 2))

      // Extract sources
      const sources =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks
          ?.map((chunk) => chunk.web)
          .filter((web): web is { title: string; uri: string } => !!web) || []

      console.log('Extracted sources:', sources)

      return { result, sources }
    } catch (error) {
      lastError = error
      console.error(`Verification failed (attempt ${attempt + 1}/${maxRetries}):`, error)
      break
    }
  }

  console.error('All verification attempts failed:', lastError)
  return {
    result: {
      verdict: 'Unverified',
      score: 0,
      explanation: 'Could not verify claim due to an error.'
    },
    sources: []
  }
}

// --- Live Connection Helper ---

export const LIVE_MODEL = 'gemini-2.5-flash-native-audio-latest'

export const detectClaimTool: FunctionDeclaration = {
  name: 'detect_claim',
  description:
    'Call this function immediately when you detect a distinct, checkable factual claim in the audio stream. MAKE SURE you use the same language as the audio stream for the claim title and claim text.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      claim_title: {
        type: Type.STRING,
        description: 'The concise title that describes the claim.'
      },
      claim_text: {
        type: Type.STRING,
        description: 'The summarized factual claim.'
      }
    },
    required: ['claim_text', 'claim_title']
  }
}

export interface LiveSessionCallbacks {
  onopen?: () => void
  onclose?: () => void
  onerror?: (error: unknown) => void
  onmessage?: (message: unknown) => void
}

/**
 * Connect to Gemini Live session for real-time audio fact-checking
 * 
 * IMPORTANT: In OAuth mode, browser WebSockets cannot send Authorization headers.
 * The SDK's live.connect() will not work properly in OAuth mode from the renderer.
 * For OAuth, use the WebSocket proxy via main process (window.api.wsConnect).
 * 
 * This function currently supports API Key mode directly. For OAuth mode,
 * callers should use the WebSocket proxy API instead.
 */
export async function connectToLiveSession(callbacks: LiveSessionCallbacks) {
  // Check if we're in OAuth mode - WebSocket won't work from renderer
  if (currentMode === 'oauth') {
    console.warn('OAuth mode detected: Browser WebSockets cannot send Authorization headers.')
    console.warn('For OAuth Live sessions, use the WebSocket proxy via main process.')
    console.warn('Consider calling window.api.wsConnect() instead.')
    
    // Attempt to use the SDK anyway with a fallback approach
    // The SDK might support access_token query param as fallback
    // If not, this will fail and the caller should use the proxy
  }

  const listeningAgentPrompt= `
  You are a high-sensitivity, objective Fact-Checking Listener. 
  Your sole purpose is to monitor audio for any assertion 
  of fact—meaning any statement that describes a specific event, 
  statistic, behavior, or condition in the physical world.
  You must trigger the detect_claim tool for any statement that meets any of the following examples:
  - Statistical/Numerical: "GDP grew by 5%," "Prices are up 40%."
  - Behavioral/Event-based: "People in [Location] are [Action]," "The protest started at 5 PM."
  - Historical/Causal: "This law caused the deficit to rise," "He said X in 2012."
  - Comparative: "Company A is bigger than Company B."
  - Definitional: "A [Category] is defined as [Definition]."
  
  Plausibility Independent: Detect the claim even if it sounds improbable, 
  exaggerated, or inflammatory. 
  Look for context: If the claim is connected to a previous claim call the tool with the combined claim.
  Only group claims that are directly related to each other.
  Only call the tool if it is an actual statement of fact. Do not call the tool for opinions, 
  personal beliefs, or subjective statements.
  Ignore Sentiment: Do not let the tone (angry, joking, sarcastic) prevent you from extracting the underlying claim.
  Do NOT transcribe normal conversation. Only extract claims.
  Do NOT generate audio or text responses. Remain silent and only use the tool.
`

  return await getClient().live.connect({
    model: LIVE_MODEL,
    config: {
      tools: [{ functionDeclarations: [detectClaimTool] }],
      systemInstruction: listeningAgentPrompt,
      responseModalities: [Modality.AUDIO]
    },
    callbacks: {
      onopen: () => {
        console.log('Gemini Live Connected')
        callbacks.onopen?.()
      },
      onclose: (e) => {
        console.log('Gemini Live Closed', e)
        callbacks.onclose?.()
      },
      onerror: (err) => {
        console.error('Gemini Live Error', err)
        callbacks.onerror?.(err)
      },
      onmessage: (message) => {
        console.log('Gemini Live Message', message)
        callbacks.onmessage?.(message)
      }
    }
  })
}

/**
 * Check if Live session requires WebSocket proxy (OAuth mode)
 * Returns true if OAuth mode is active and caller should use window.api.wsConnect()
 */
export function requiresLiveProxy(): boolean {
  return currentMode === 'oauth'
}

/**
 * Get stored API key for WebSocket proxy
 */
export function getStoredApiKey(): string | null {
  return storedApiKey
}
