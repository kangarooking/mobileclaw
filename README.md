# 🦞 MobileClaw

**带眼睛的龙虾对讲机** — Multimodal voice+vision walkie-talkie for [OpenClaw](https://github.com/openclaw/openclaw) AI agents.

> 手机是最高频硬件。纯语音唤醒解放双手，实时画面让龙虾有眼睛。

## What is MobileClaw?

MobileClaw is an iOS/Android mobile app that serves as your **personal multimodal terminal** for OpenClaw AI agents. It enables:

- **Voice wake-up**: Say "Hey Siri, open claw" (or tap the screen) to activate
- **Real-time camera streaming**: Your phone's camera sends live video frames to your AI agent
- **Voice conversation**: Speak naturally, get AI responses spoken back via TTS
- **Multi-agent support**: Configure multiple OpenClaw gateways for different scenarios
- **Chat history**: Push conversations to Feishu/Lark for record-keeping

## Architecture

```
┌─────────────────────────────────────────────┐
│  SessionScreen (Camera + Chat + Audio UI)    │
├─────────────────────────────────────────────┤
│  Hooks: useWakeUp → useCameraStream → useGateway │
├─────────────────────────────────────────────┤
│  Services: CameraManager ↔ ASRService ↔ TTSService │
│                    ↕                         │
│           GatewayClient (OpenClaw WS Protocol) │
│                    ↕                         │
│            FeishuPushService                 │
├─────────────────────────────────────────────┤
│  State: Zustand | Native: VisionCamera / SecureStorage │
└─────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native + Expo Dev Client (Bare Workflow) |
| Language | TypeScript |
| State | Zustand |
| Camera | react-native-vision-camera v4 (Frame Processor API) |
| Navigation | React Navigation v6 (Native Stack) |
| Target | iOS 16+ (first), Android 13+ (later) |

## Quick Start

```bash
# Install dependencies
npm install

# Start Expo Dev Client (requires iOS simulator or physical device)
npm start

# Or prebuild native projects first
npx expo prebuild --clean --platform ios
```

### Configuration

1. Open the app and go to **Settings (⚙️)**
2. Add your OpenClaw Gateway:
   - **Name**: e.g., "Home"
   - **WebSocket URL**: e.g., `ws://192.168.1.100:18789`
   - **Auth Token**: Your OpenClaw gateway token
3. Select ASR/TTS providers
4. Tap "Tap to Talk" on Home to activate!

## Project Structure

```
src/
├── types/          # Protocol types, config, session state
├── store/           # Zustand stores (app + session)
├── services/
│   ├── gateway/     # OpenClaw WS client (auth/RPC/reconnect)
│   ├── camera/      # VisionCamera manager + frame sender
│   ├── audio/       # ASR + TTS provider abstraction
│   ├── wake/        # Voice wake-up orchestrator
│   ├── history/     # Feishu push service
│   └── storage/     # Secure storage + config persistence
├── screens/         # Home, Session, Settings
├── components/      # Reusable UI components
├── hooks/           # useWakeUp, useGateway, etc.
└── utils/           # Logger, constants
```

## OpenClaw Integration

MobileClaw connects to OpenClaw using its standard **Gateway WebSocket protocol**:

1. **Challenge → Connect → Hello-OK** authentication handshake
2. **RPC calls** (`send`, `tts.convert`, etc.) over JSON text frames
3. **Dual-strategy video**:
   - Strategy A: Attach latest JPEG frame in `send` message (compatible)
   - Strategy B: Continuous `video_frame` event stream (real-time)

See `src/types/protocol.ts` for full type definitions based on OpenClaw's schema.

## Roadmap

### Phase 1 (Current)
- [x] Project scaffolding & build pipeline
- [x] OpenClaw GatewayClient (protocol integration)
- [x] Type definitions & state management
- [ ] Camera frame capture (VisionCamera)
- [ ] Audio pipeline (ASR + TTS)
- [ ] Basic UI (Home + Session + Settings)
- [ ] Voice wake-up (iOS Siri Shortcut)
- [ ] Feishu history push

### Phase 2
- H.264 hardware encoding
- Full App Intents (iOS)
- Node role registration (remote camera.snap)
- Android support
- Local wake word (Porcupine)

### Phase 3+
- Claude Code / other LLM integrations
- Apple Watch companion
- Conversation history search

## License

MIT

---

**Made with 🦞 by 袋鼠帝**
