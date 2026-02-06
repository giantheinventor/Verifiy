# Verify - Real-Time AI Fact Checker

A desktop application that listens to audio from your microphone and/or screen, detects factual claims in real-time, and verifies them using Google's Gemini AI with grounded search.

## Features

- **🎤 Dual Audio Capture** - Listen to microphone input, screen/desktop audio, or both simultaneously
- **🔍 Real-Time Claim Detection** - AI identifies factual claims as they're spoken
- **✅ Automated Fact-Checking** - Claims are verified using Gemini AI with Google Search grounding
- **📊 Verdict Display** - See verdicts (True, False, Mixed, Misleading, Unverified) with confidence scores
- **🔗 Source Citations** - Each verification includes links to supporting sources
- **🔄 API Key Rotation** - Supports multiple API keys to handle rate limits

## How It Works

1. **Audio Capture**: The app captures audio from your selected input (mic, screen, or both)
2. **Live Processing**: Audio is streamed to Gemini's native audio model
3. **Claim Detection**: The AI identifies factual statements in the audio
4. **Verification**: Each claim is fact-checked using Gemini with Google Search
5. **Results**: Verdicts and sources are displayed in real-time

## Setup

### Prerequisites

- Node.js 20+ 
- npm
- Google Gemini API key(s)

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file in the project root:

```env
# Single API key
VITE_GEMINI_API_KEY=your_api_key_here

# Or multiple keys for rotation (handles rate limits)
VITE_GEMINI_API_KEY_0=key_1
VITE_GEMINI_API_KEY_1=key_2
VITE_GEMINI_API_KEY_2=key_3
```

### Development

```bash
npm run dev
```

### Build

```bash
# For macOS
npm run build:mac
```

## Usage

1. Launch the app
2. Select your input mode (Mic, Screen, or Both)
3. Click the soundwave button to start listening
4. Speak or play audio containing factual claims
5. Watch as claims are detected and verified in real-time

## Tech Stack

- **Electron** - Cross-platform desktop app
- **React + TypeScript** - UI framework
- **Gemini AI** - Live audio processing & fact verification
- **Web Audio API** - Audio capture and processing

## Input Modes

| Mode | Description |
|------|-------------|
| **Mic** | Captures audio from your microphone |
| **Screen** | Captures audio from screen share/desktop audio |
| **Both** | Mixes mic and screen audio together |

## License

MIT
