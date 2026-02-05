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
  verdict: 'True' | 'False' | 'Misleading' | 'Unverified' | 'Mixed'
  score: number
  explanation: string
}

export async function verifyClaimWithSearch(
  claimText: string
): Promise<{ result: VerificationResult; sources: { title: string; uri: string }[] }> {
  try {
    const model = 'gemini-3-flash-preview'

    const prompt = `
      Fact check the following claim: "${claimText}".
      Use Google Search to find recent and relevant sources.
      Use trusted sources only.
      
      Return a JSON object with:
      - verdict: One of "True", "False", "Misleading", "Unverified", "Mixed".
      - score: An integer from 1 (Totally False) to 5 (Totally True).
      - explanation: A concise (max 2 sentences) explanation of the finding.
    `

    const response = await getAI().models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verdict: {
              type: Type.STRING,
              enum: ['True', 'False', 'Misleading', 'Unverified', 'Mixed']
            },
            score: { type: Type.INTEGER },
            explanation: { type: Type.STRING }
          },
          required: ['verdict', 'score', 'explanation']
        }
      }
    })

    const resultText = response.text || '{}'
    const result = JSON.parse(resultText) as VerificationResult

    // Extract sources
    const sources =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks
        ?.map((chunk) => chunk.web)
        .filter((web): web is { title: string; uri: string } => !!web) || []

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
    'Call this function immediately when you detect a distinct, checkable factual claim in the audio stream.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      claim_text: {
        type: Type.STRING,
        description: 'The verbatim or summarized factual claim.'
      }
    },
    required: ['claim_text']
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

  return await getAI().live.connect({
    model: LIVE_MODEL,
    config: {
      tools: [{ functionDeclarations: [detectClaimTool] }],
      systemInstruction: `
        You are an automated fact-checking listener. 
        Your task is to listen to the audio stream and identify specific, verifiable factual claims.
        When you hear a claim (e.g., "The GDP grew by 5% last year", "Use of plastic has doubled"), call the 'detect_claim' tool immediately.
        Do NOT transcribe normal conversation. Only extract claims.
        Do NOT generate audio or text responses. Remain silent and only use the tool.
      `,
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
