import { GoogleGenAI, Type, Modality } from '@google/genai'
import type { FunctionDeclaration, Session } from '@google/genai'

// --- Authentication Management ---

// Module-level client instance
let ai: GoogleGenAI | null = null

// Store credentials for reference
let storedApiKey: string | null = null

/**
 * Disconnect and clear the Gemini client
 * Call this when logging out or deleting API key
 */
export function disconnect(): void {
  console.log('Disconnecting Gemini client...')
  ai = null
  storedApiKey = null
}

/**
 * Get auth query parameter for API key mode
 * Returns '?key=<apiKey>'
 */
export function getAuthQueryParam(): string {
  if (storedApiKey) {
    return `?key=${storedApiKey}`
  }
  return ''
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
  console.log('Connected with API key')
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
    throw new Error('Gemini client not initialized. Call connectWithApiKey() first.')
  }
  return ai
}

// --- Fact Check Verification Service ---

interface VerificationResult {
  verdict: 'True' | 'False' | 'Unverified' | 'Mixed'
  score: number
  explanation: string
}

// Helper to parse text-based response from prompt3
function parseTextVerificationResult(text: string): VerificationResult | null {
  try {
    const verdictMatch = text.match(/VERDICT:\s*(True|False|Mixed|Unverified)/i)
    const scoreMatch = text.match(/SCORE:\s*(\d)/i)
    const explanationMatch = text.match(/EXPLANATION:\s*(.+)/i)

    if (verdictMatch && scoreMatch && explanationMatch) {
      return {
        verdict: verdictMatch[1] as 'True' | 'False' | 'Unverified' | 'Mixed',
        score: parseInt(scoreMatch[1], 10),
        explanation: explanationMatch[1].trim()
      }
    }
  } catch (e) {
    console.warn('Failed to parse text verification result:', e)
  }
  return null
}

export async function verifyClaimWithSearch(
  claimText: string
): Promise<{ result: VerificationResult; sources: { title: string; uri: string }[] }> {
  let lastError: unknown = null
  
  const model3 = 'gemini-3-flash-preview'
  const model2 = 'gemini-2.5-flash-preview-09-2025'

  const prompt3 = `
    Fact check this claim: "${claimText}"

    1. Search via Google to verify.
    2. Respond using EXACTLY this text format (do not use markdown blocks or JSON):

    VERDICT: [True/False/Mixed/Unverified]
    SCORE: [1-5]
    EXPLANATION: [Concise explanation here]

    Important: You must use the Google Search tool.
  `

  const prompt2 = `
    Fact check the following claim: "${claimText}".

    STEP 1: You MUST use the Google Search tool to find verification. 
    Even if you know the answer, search to get the URL source.
    
    STEP 2: Return ONLY a JSON object WITH EXACTLY THESE FIELDS:
    {
      "verdict": "True" | "False"  | "Unverified" | "Mixed",
      "score": 1-5 (integer, 1=Totally False, 5=Totally True),
      "explanation": "A concise (max 2 sentences) explanation",
      "sources": [{"title": "Source Domain (e.g. wikipedia.org)", "url": "The real source URL (NOT a google redirect link)"}]
    }
    If your verdict is true, false or mixed you must have sources. 
    IF YOU DONT HAVE SOURCES IN YOUR ANSWER SEARCH AGAIN FOR SOURCES.
    Use the language of the claim for the content.
  `

  // Helper to extract sources from Gemini response (handles SDK's optional properties)
  const extractSources = (response: unknown): { title: string; uri: string }[] => {
    const resp = response as {
      candidates?: Array<{
        groundingMetadata?: {
          groundingChunks?: Array<{
            web?: { title?: string; uri?: string }
          }>
        }
      }>
    }
    return (
      resp.candidates?.[0]?.groundingMetadata?.groundingChunks
        ?.map((chunk) => chunk.web)
        .filter(
          (web): web is { title: string; uri: string } =>
            !!web && typeof web.title === 'string' && typeof web.uri === 'string'
        ) || []
    )
  }

  // Attempt 1: Model 3 (Text-based) - Single fail-fast attempt
  try {
    console.log(`Attempting verification with ${model3}...`)
    const response = await getClient().models.generateContent({
      model: model3,
      contents: prompt3,
      config: {
        tools: [{ googleSearch: {} }]
      }
    })

    const responseText = response.text || ''
    const result = parseTextVerificationResult(responseText)

    if (result) {
        const sources = extractSources(response)
        console.log('Verification successful with model3')
        return { result, sources }
    } else {
        console.warn('Failed to parse model3 response, falling back...', responseText)
    }
  } catch (error) {
    console.warn('Model3 verification failed, falling back:', error)
    lastError = error
  }

  // Fallback: Model 2 (JSON-based) - Retry loop
  const maxRetries = 3
  console.log(`Falling back to ${model2} with ${maxRetries} retries...`)

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await getClient().models.generateContent({
        model: model2,
        contents: prompt2,
        config: {
          tools: [{ googleSearch: {} }]
        }
      })

      const responseText = response.text || '{}'
      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      const jsonText = jsonMatch ? jsonMatch[0] : '{}'
      const result = JSON.parse(jsonText) as VerificationResult
      
      const sources = extractSources(response)
      console.log(`Verification successful with model2 (attempt ${attempt + 1})`)
      
      return { result, sources }
    } catch (error) {
      lastError = error
      console.error(`Model2 verification failed (attempt ${attempt + 1}/${maxRetries}):`, error)
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
 */
export async function connectToLiveSession(
  callbacks: LiveSessionCallbacks
): Promise<Session> {
  const listeningAgentPrompt = `
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
  If the context of the claim is longer than 10 seconds call the tool with the combined claims up until this point and start a new claim context for following claims.
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
 * Get stored API key for WebSocket proxy
 */
export function getStoredApiKey(): string | null {
  return storedApiKey
}
