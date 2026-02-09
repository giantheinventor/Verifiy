# Verify - Real-Time AI Fact Checker

A macOS only desktop application that listens to audio from your microphone and/or system audio, detects factual claims in real-time, and verifies them using Google's Gemini AI with grounded search.

## Features

- **🎤 Dual Audio Capture** - Listen to microphone input, system audio, or both simultaneously.
- **🔍 Real-Time Claim Detection** - AI identifies factual claims as they're spoken.
- **✅ Automated Fact-Checking** - Claims are verified using Gemini AI with Google Search grounding.
- **🔐 Secure Authentication** - Log in with your Google Account (OAuth) or use your own API Key.
- **📊 Verdict Display** - Clear verdicts (True, False, Mixed, Unverified) with source citations.
- **🌗 Dark/Light Mode** - Themed UI that respects system preferences.
- **⚡ Fast & Efficient** - Powered by Gemini for low-latency verification.

## Authentication Modes

Verify supports two ways to connect to Google's Gemini API:

### 1. Google OAuth 
Sign in securely with your Google Account. This is the easiest way to get started and manages tokens automatically.
- Click "Login with Google" in the sidebar.
- Approve the app permissions.
- You're ready to go!

### 2. API Key
We recommend using your own API key directly:
- Generate a key at [Google AI Studio](https://aistudio.google.com/).
- Open the Sidebar -> Manage API Key.
- Paste your key. It will be stored securely on your device.

## Usage

1. **Launch the App**.
2. **Authenticate** using Google Login or an API Key via the Sidebar settings.
3. **Select Input**: Choose Mic, Screen (System Audio), or Both.
4. **Start Listening**: Click the soundwave button.
5. **View Results**: As claims are detected, cards will appear with verification results and sources.

**Tip:** Click the **?** button in the bottom right for a guided walkthrough of the app's features.

## Setup for Developers

### Prerequisites

- Node.js 20+
- npm
- An OAuth 2.0 Client ID and Secret (if developing authentication features)

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file in the project root for development credentials:

```env
# Required for OAuth (Development Only)
MAIN_VITE_CLIENT_ID=your_google_cloud_client_id
MAIN_VITE_CLIENT_SECRET=your_google_cloud_client_secret
```

### Development

Run the renderer and main process in development mode:

```bash
npm run dev
```

## Tech Stack

- **Electron** - macos desktop runtime
- **React + TypeScript** - UI framework
- **Gemini 3/2.5 Flash** - Multimodal AI model for audio processing and reasoning
- **Google Search Grounding** - For up-to-date fact verification
