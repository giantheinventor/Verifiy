import { GoogleGenAI, Type, Modality } from '@google/genai'
import type { FunctionDeclaration } from '@google/genai'

// Load all available API keys from environment (VITE_GEMINI_API_KEY_0 through VITE_GEMINI_API_KEY_9)
const API_KEYS: string[] = []
for (let i = 0; i <= 9; i++) {
  const key = import.meta.env[`VITE_GEMINI_API_KEY_${i}`]
  if (key) {
    API_KEYS.push(key)
  }
}
// Fallback to the original key name if no numbered keys found
if (API_KEYS.length === 0) {
  const defaultKey = import.meta.env.VITE_GEMINI_API_KEY
  if (defaultKey) {
    API_KEYS.push(defaultKey)
  }
}

console.log(`Loaded ${API_KEYS.length} API key(s)`)

// Track current key index
let currentKeyIndex = 0

// Lazy initialization
let ai: GoogleGenAI | null = null

function getAI(): GoogleGenAI {
  if (!ai) {
    
      ai = new GoogleGenAI({ apiKey: API_KEYS[currentKeyIndex] })
  }
  return ai
}

// Rotate to next API key and reinitialize client
function rotateApiKey(): boolean {
  if (API_KEYS.length <= 1) {
    console.warn('No additional API keys available to rotate to')
    return false
  }
  
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length
  console.log(`Rotating to API key ${currentKeyIndex + 1}/${API_KEYS.length}`)
  ai = new GoogleGenAI({ apiKey: API_KEYS[currentKeyIndex] })
  return true
}

// Check if error is a quota exceeded error (429)
function isQuotaError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') || 
           error.message.toLowerCase().includes('quota') ||
           error.message.toLowerCase().includes('rate limit')
  }
  return false
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
  const maxRetries = API_KEYS.length
  let lastError: unknown = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const model = 'gemini-2.5-flash-preview-09-2025'

      const prompt = `
        Fact check the following claim: "${claimText}".
        Use Google Search to find recent and relevant sources.
        Use trusted sources only.
        
        Return ONLY a JSON object (no markdown, no explanation outside the JSON) with exactly these fields:
        {
          "verdict": "True" | "False"  | "Unverified" | "Mixed",
          "score": 1-5 (integer, 1=Totally False, 5=Totally True),
          "explanation": "A concise (max 2 sentences) explanation"
        }
      `

      const response = await getAI().models.generateContent({
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
      
      // If quota error and we have more keys, rotate and retry
      if (isQuotaError(error) && rotateApiKey()) {
        console.log('Retrying with next API key...')
        continue
      }
      
      // If not a quota error or no more keys, break out
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

// --- Chat Service ---

export async function sendChatMessage(
  history: { role: 'user' | 'model'; text: string }[],
  message: string
): Promise<string | undefined> {
  try {
    const chat = getAI().chats.create({
      model: 'gemini-2.5-flash-preview-05-20',
      history: history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }]
      }))
    })

    const result = await chat.sendMessage({ message })
    return result.text
  } catch (error) {
    console.error('Chat error:', error)
    return 'Sorry, I encountered an error responding to that.'
  }
}

// --- Live Connection Helper ---

export const LIVE_MODEL = 'gemini-2.5-flash-native-audio-latest'

export const detectClaimTool: FunctionDeclaration = {
  name: 'detect_claim',
  description:
    'Call this function immediately when you detect a distinct, checkable factual claim in the audio stream. Use the same language as the audio stream.',
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
  onerror?: (error: any) => void
  onmessage?: (message: any) => void
}

export async function connectToLiveSession(callbacks: LiveSessionCallbacks) {
  if (API_KEYS.length === 0) {
    throw new Error('No API keys configured. Please set VITE_GEMINI_API_KEY_0 in your .env file.')
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

  return await getAI().live.connect({
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
