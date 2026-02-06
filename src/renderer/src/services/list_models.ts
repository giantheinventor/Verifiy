import { GoogleGenAI } from '@google/genai'
import dotenv from 'dotenv'
dotenv.config()

const apiKey = process.env.VITE_GEMINI_API_KEY
if (!apiKey) {
  console.error('VITE_GEMINI_API_KEY is not set')
  process.exit(1)
}

const ai = new GoogleGenAI({ apiKey })

async function listModels() {
  try {
    const response = await ai.models.list()
    console.log('Available Models:')
    for await (const model of response) {
      if (model.name && model.name.includes('flash')) {
        console.log(`- ${model.name}`)
        console.log(`  DisplayName: ${model.displayName}`)
        console.log(
          `  SupportedGenerationMethods: ${JSON.stringify((model as any).supportedGenerationMethods)}`
        )
      }
    }
  } catch (error) {
    console.error('Error listing models:', error)
  }
}

listModels()
