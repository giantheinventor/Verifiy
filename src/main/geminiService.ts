import WebSocket from 'ws'
import { BrowserWindow } from 'electron'
import { EventEmitter } from 'events'

/**
 * Gemini Live API WebSocket URL
 */
const GEMINI_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

/**
 * Default model for live sessions
 */
const DEFAULT_MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025'

/**
 * Text model for fact-checking (no audio required)
 */
const FACTCHECK_MODEL = 'models/gemini-2.5-flash'

// ============================================================================
// LISTENING AGENT - Monitors audio and detects factual claims
// ============================================================================

const LISTENING_AGENT_PROMPT = `
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

Plausibility Independent: Detect the claim even if it sounds improbable, exaggerated, or inflammatory.
Look for context: If the claim is connected to a previous claim, call the tool with the combined claim.
Only group claims that are directly related to each other.
Only call the tool if it is an actual statement of fact. Do not call for opinions or subjective statements.
Ignore Sentiment: Do not let the tone (angry, joking, sarcastic) prevent you from extracting the underlying claim.
Do NOT transcribe normal conversation. Only extract claims.
Do NOT generate audio or text responses. Remain silent and only use the tool.
`

const DETECT_CLAIM_TOOL = {
  function_declarations: [{
    name: 'detect_claim',
    description: 'Call this function when you detect a checkable factual claim.',
    parameters: {
      type: 'object',
      properties: {
        claim_title: {
          type: 'string',
          description: 'A concise title describing the claim.'
        },
        claim_text: {
          type: 'string',
          description: 'The summarized factual claim.'
        }
      },
      required: ['claim_title', 'claim_text']
    }
  }]
}



/**
 * ListeningAgent - Monitors audio stream and detects factual claims
 */
export class ListeningAgent extends EventEmitter {
  private ws: WebSocket | null = null
  private mainWindow: BrowserWindow | null = null
  
  // Callback for sending data to renderer
  public onData: ((data: unknown) => void) | null = null
  
  constructor(private accessToken: string) {
    super()
  }
  
  /**
   * Set the main window for IPC communication
   */
  public setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }
  
  /**
   * Connect to Gemini Live API
   */
  public connect(): void {
    // Initialize WebSocket with OAuth Bearer Token in Headers
    this.ws = new WebSocket(GEMINI_WS_URL, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    
    this.ws.on('open', () => {
      console.log('[ListeningAgent] Connected to Gemini Live API')
      this.sendSetupMessage()
      this.emit('open')
    })
    
    this.ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString())
        this.handleServerMessage(response)
      } catch (error) {
        console.error('[ListeningAgent] Failed to parse message:', error)
      }
    })
    
    this.ws.on('error', (error) => {
      console.error('[ListeningAgent] WebSocket Error:', error)
      this.emit('error', error)
      this.notifyRenderer({ type: 'error', data: { message: error.message } })
    })
    
    this.ws.on('close', (code, reason) => {
      console.log(`[ListeningAgent] Closed: ${code} - ${reason.toString()}`)
      this.emit('close', { code, reason: reason.toString() })
      this.notifyRenderer({ type: 'closed', data: { code, reason: reason.toString() } })
    })
  }
  
  /**
   * Send the setup message with agent configuration
   */
  private sendSetupMessage(): void {
    const setupMessage = {
      setup: {
        model: DEFAULT_MODEL,
        generation_config: {
          response_modalities: ['AUDIO']
        },
        system_instruction: {
          parts: [{ text: LISTENING_AGENT_PROMPT }]
        },
        tools: [DETECT_CLAIM_TOOL]
      }
    }
    
    this.ws?.send(JSON.stringify(setupMessage))
    console.log('[ListeningAgent] Agent Setup sent - Listening started.')
    this.emit('setup_complete')
    this.notifyRenderer({ type: 'setup_complete', data: {} })
  }
  
  /**
   * Handle incoming messages from Gemini
   */
  private handleServerMessage(message: unknown): void {
    const msg = message as Record<string, unknown>
    
    // Check for setup complete
    if (msg.setupComplete) {
      console.log('[ListeningAgent] Setup confirmed by server')
      return
    }
    
    // Look for tool calls (detected claims)
    if (msg.toolCall) {
      const toolCall = msg.toolCall as { functionCalls?: Array<{ name: string; args: Record<string, unknown>; id?: string }> }
      const calls = toolCall.functionCalls || []
      
      calls.forEach((call) => {
        if (call.name === 'detect_claim') {
          console.log('[ListeningAgent] Claim Detected:', call.args)
          
          const claimData = {
            name: call.name,
            args: call.args,
            id: call.id
          }
          
          
          this.emit('claim_detected', claimData)
          this.notifyRenderer({ type: 'tool_call', data: claimData })
          
          // Send tool response to acknowledge receipt
          this.sendToolResponse({
            functionResponses: [{
              name: call.name,
              response: { result: 'Claim processing started' },
              id: call.id
            }]
          })
        }
      })
      return
    }
    
    // Look for server content (transcriptions, audio responses)
    if (msg.serverContent) {
      this.emit('server_content', msg.serverContent)
      this.notifyRenderer({ type: 'server_content', data: msg.serverContent })
    }
  }
  
  /**
   * Send audio chunk to Gemini
   */
  public sendAudio(base64Data: string, mimeType: string = 'audio/pcm;rate=16000'): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const audioMessage = {
        realtime_input: {
          media_chunks: [{
            mime_type: mimeType,
            data: base64Data
          }]
        }
      }
      this.ws.send(JSON.stringify(audioMessage))
    }
  }

  /**
   * Send tool response to Gemini
   */
  public sendToolResponse(response: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const toolResponseMessage = {
        tool_response: response
      }
      this.ws.send(JSON.stringify(toolResponseMessage))
    }
  }
  
  /**
   * Disconnect from Gemini
   */
  public disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
  
  /**
   * Send data to renderer via callback or IPC
   */
  private notifyRenderer(data: unknown): void {
    if (this.onData) {
      this.onData(data)
    }
    if (this.mainWindow) {
      this.mainWindow.webContents.send('gemini-data', data)
    }
  }
}

// ============================================================================
// FACT-CHECK FUNCTION - Verifies claims using REST API with Google Search
// ============================================================================

/**
 * Fact-check a claim using Gemini REST API with Google Search
 * @param claimText The claim to verify
 * @param accessToken OAuth access token
 * @returns Parsed fact-check result
 */
export async function runFactCheck(
  claimText: string,
  accessToken: string
): Promise<{ verdict: string; explanation: string; score: number; sources?: { title: string; uri: string }[] }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/${FACTCHECK_MODEL}:generateContent`

  // Single Agent Approach
  const prompt = `
        Fact check the following claim: "${claimText}".
        Use Google Search to find recent and relevant sources.
        Use trusted sources only. MAKE SURE to use only sources and do not infer things based on the claim.
        
        Return ONLY a JSON object (no markdown, no explanation outside the JSON) with exactly these fields:
        {
          "verdict": "True" | "False"  | "Unverified" | "Mixed",
          "score": 1-5 (integer, 1=Totally False, 5=Totally True),
          "explanation": "A concise (max 2 sentences) explanation",
          "sources": [{"title": "Source Domain (e.g. wikipedia.org)", "url": "The real source URL (NOT a google redirect link)"}]
        }
        use the language of the claim
      `

  console.log(`[FactCheck] Starting single-agent check for: "${claimText}"`)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }]
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Fact check failed: ${errorText}`)
  }

  const data = await response.json()
  const candidate = data.candidates?.[0]
  const text = candidate?.content?.parts?.[0]?.text || '{}'

  console.log('[FactCheck] Raw Response Text:', text)

  // Parse JSON
  let result
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const jsonText = jsonMatch ? jsonMatch[0] : '{}'
    result = JSON.parse(jsonText)
  } catch (e) {
    console.error('[FactCheck] JSON Parse Error:', e)
    result = {
      verdict: 'Unverified',
      explanation: 'Failed to parse model response.',
      score: 0
    }
  }

  // Extract Sources
  // Priority: 1. Sources from JSON response
  //           2. Grounding Metadata
  
  let candidates: any[] = []

  if (result.sources && Array.isArray(result.sources) && result.sources.length > 0) {
    candidates = result.sources
  } else {
    candidates = candidate?.groundingMetadata?.groundingChunks
      ?.map((chunk: any) => chunk.web)
      .filter((web: any) => !!web && !!web.uri) || []
  }

  // Process sources (resolve redirects, clean titles)
  const limitedSources = await processSources(candidates)

  console.log('[FactCheck] Extracted & Cleaned Sources:', limitedSources)



  return {
    verdict: result.verdict || 'Unverified',
    explanation: result.explanation || 'No explanation provided.',
    score: result.score || 0,
    sources: limitedSources
  }
}


// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Cleans a list of sources, resolves redirects, and extracts real domains.
 * @param rawSources - The sources from groundingMetadata or JSON
 * @returns The cleaned sources
 */
async function processSources(rawSources: { title?: string; uri?: string; url?: string }[]): Promise<{ title: string; uri: string }[]> {
  if (!rawSources || !Array.isArray(rawSources)) return []

  const cleanSources = await Promise.all(
    rawSources.slice(0, 5).map(async (source: any) => {
      let uri = source.uri || source.url || ""
      let title = source.title || "Quelle"

      // 1. Check: Is it a known redirect link?
      const isRedirect = 
        uri.includes('google.com/url') || 
        uri.includes('vertexaisearch') || 
        uri.includes('grounding-api-redirect')

      if (isRedirect && uri) {
        try {
          // A: Fast solution for simple Google links (no network request)
          if (uri.includes('google.com/url')) {
            const urlObj = new URL(uri)
            const extracted = urlObj.searchParams.get('url') || urlObj.searchParams.get('q')
            if (extracted) uri = extracted
          }

          // B: Thorough solution for Vertex/Cloud links via HEAD-Request
          if (uri.includes('vertexaisearch') || uri.includes('grounding-api-redirect')) {
            const response = await fetch(uri, { 
              method: 'HEAD', 
              redirect: 'follow',
              headers: { 'User-Agent': 'Mozilla/5.0' } 
            })
            uri = response.url
          }
        } catch (error) {
          console.error(`[Resolver] Error with URL ${uri}:`, (error as Error).message)
        }
      }

      // 2. Beautify Domain Name if title is bad
      try {
        const domain = new URL(uri).hostname.replace('www.', '')
        if (!source.title || source.title.includes('google.com') || title === "Quelle") {
          title = domain
        }
      } catch (e) {
        // If URI is invalid, keep original
      }

      // 3. Final Check: If it's still an internal link, drop it
      if (uri.includes('vertexaisearch') || uri.includes('grounding-api-redirect')) {
        return null
      }

      return { title, uri }
    })
  )

  return cleanSources.filter(s => s !== null) as { title: string; uri: string }[]
}
