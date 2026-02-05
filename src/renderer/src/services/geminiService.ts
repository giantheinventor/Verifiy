import { GoogleGenAI, Type, Modality } from '@google/genai'
import type { FunctionDeclaration } from '@google/genai'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''

// Lazy initialization to prevent errors when API key is not set
let ai: GoogleGenAI | null = null

function getAI(): GoogleGenAI {
  if (!ai) {
    if (!API_KEY) {
      console.warn('VITE_GEMINI_API_KEY is not set. Gemini features will not work.')
    }
    ai = new GoogleGenAI({ apiKey: API_KEY })
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
    console.error('Verification failed:', error)
    return {
      result: {
        verdict: 'Unverified',
        score: 0,
        explanation: 'Could not verify claim due to an error.'
      },
      sources: []
    }
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
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('API key is missing')
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
  Look for context: If the claim is connected to a previous claim or can be grouped together with other claims, 
  call the tool with the combined claim.
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
