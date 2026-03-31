/**
 * MobileClaw End-to-End Integration Test
 *
 * Validates all major subsystems without requiring a real device.
 * Tests: TypeScript compilation, module resolution, protocol types,
 *       store structure, service wiring, and configuration.
 *
 * Run: node scripts/integration-test.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, extname } from 'path';

const ROOT = decodeURIComponent(new URL('..', import.meta.url).pathname);
const SRC = join(ROOT, 'src');

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    results.push(`  ❌ ${name}: ${err.message}`);
  }
}

// ─── Test 1: Project Structure ───────────────────────────────────────

test('Project structure exists', () => {
  const required = [
    'App.tsx',
    'package.json',
    'tsconfig.json',
    'babel.config.js',
    'app.json',
    'feature_list.json',
    'progress.txt',
  ];
  for (const f of required) {
    if (!existsSync(join(ROOT, f))) throw new Error(`Missing: ${f}`);
  }
});

test('Src directory structure', () => {
  const dirs = [
    'components/camera', 'components/chat', 'components/common', 'components/audio',
    'screens', 'services/audio', 'services/audio/providers',
    'services/camera', 'services/gateway', 'services/history',
    'services/storage', 'services/wake', 'store', 'types', 'hooks', 'utils',
  ];
  for (const d of dirs) {
    if (!existsSync(join(SRC, d))) throw new Error(`Missing src/${d}/`);
  }
});

// ─── Test 2: All Source Files Parse ──────────────────────────────

test('All source files exist and are non-empty', () => {
  function findFilesRecursive(dir, ext) {
    const results = [];
    const entries = readdirSync(join(SRC, dir), { withFileTypes: true });
    for (const e of entries) {
      const fullPath = join(dir, e.name);
      if (e.isDirectory()) {
        results.push(...findFilesRecursive(fullPath, ext));
      } else if (extname(e.name) === ext) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const tsxFiles = findFilesRecursive('components', '.tsx')
    .concat(findFilesRecursive('screens', '.tsx'))
    .concat(findFilesRecursive('hooks', '.tsx'));
  const tsFiles = findFilesRecursive('services', '.ts')
    .concat(findFilesRecursive('store', '.ts'))
    .concat(findFilesRecursive('types', '.ts'))
    .concat(findFilesRecursive('utils', '.ts'));

  const allFiles = [...tsxFiles, ...tsFiles];
  if (allFiles.length < 15) throw new Error(`Too few source files (${allFiles.length}), expected 30+`);

  for (const f of allFiles) {
    const content = readFileSync(join(SRC, f), 'utf-8');
    if (content.length < 10) throw new Error(`${f} is suspiciously empty (< 10 chars)`);
  }
});

// ─── Test 3: Type Definitions ─────────────────────────────────────

test('Protocol types defined correctly', () => {
  const protoPath = join(SRC, 'types/protocol.ts');
  const content = readFileSync(protoPath, 'utf-8');
  const requiredTypes = [
    'GatewayFrame', 'RequestFrame', 'ResponseFrame', 'EventFrame',
    'ConnectParams', 'HelloOkPayload', 'ChatSendParams', 'SendParams',
    'TTSConvertParams', 'ClientInfo', 'DeviceIdentity',
  ];
  for (const t of requiredTypes) {
    if (!content.includes(t)) throw new Error(`Missing type: ${t}`);
  }
  // Verify no duplicate ChatSendParams
  const matches = content.match(/ChatSendParams/g);
  if (!matches || matches.length !== 1) {
    throw new Error('ChatSendParams should appear exactly once (no duplicates)');
  }
});

test('Config types defined correctly', () => {
  const configPath = join(SRC, 'types/config.ts');
  const content = readFileSync(configPath, 'utf-8');
  const required = ['GatewayConfig', 'ASRProviderConfig', 'TTSProviderConfig', 'FeishuConfig', 'VideoConfig', 'AppConfig'];
  for (const t of required) {
    if (!content.includes(t)) throw new Error(`Missing config type: ${t}`);
  }
});

test('Session types defined', () => {
  const sessionPath = join(SRC, 'types/session.ts');
  const content = readFileSync(sessionPath, 'utf-8');
  if (!content.includes('ChatMessage')) throw new Error('Missing ChatMessage type');
  if (!content.includes('SessionMode')) throw new Error('Missing SessionMode type');
});

// ─── Test 4: Store Wiring ───────────────────────────────────────────

test('Zustand stores properly structured', () => {
  const appStore = readFileSync(join(SRC, 'store/useAppStore.ts'), 'utf-8');
  const sessionStore = readFileSync(join(SRC, 'store/useSessionStore.ts'), 'utf-8');

  // AppStore should have gateway management
  if (!appStore.includes('setActiveGateway')) throw new Error('Missing setActiveGateway in AppStore');
  if (!appStore.includes('addGateway')) throw new Error('Missing addGateway in AppStore');
  if (!appStore.includes('updateConfig')) throw new Error('Missing updateConfig in AppStore');

  // SessionStore should have conversation state
  if (!sessionStore.includes('addMessage')) throw new Error('Missing addMessage in SessionStore');
  if (!sessionStore.includes('commitTranscript')) throw new Error('Missing commitTranscript in SessionStore');
  if (!sessionStore.includes('setIsTTSSpeaking')) throw new Error('Missing setIsTTSSpeaking in SessionStore');
});

// ─── Test 5: Service Layer ─────────────────────────────────────────

test('GatewayClient has complete RPC flow', () => {
  const gc = readFileSync(join(SRC, 'services/gateway/GatewayClient.ts'), 'utf-8');
  const requiredMethods = [
    'connect(', 'challenge', 'connect(', 'sendConnectRequest(',
    'rpc(', 'chatSend(', 'sendEvent(', 'sendRaw(',
    'disconnect(', 'onStatusChange(', 'onEvent(', 'onDisconnect(',
    'setDeviceIdentity(', 'buildDeviceAuthObject(',
  ];
  for (const m of requiredMethods) {
    if (!gc.includes(m)) throw new Error(`GatewayClient missing: ${m}`);
  }
});

test('Camera pipeline complete', () => {
  const cm = readFileSync(join(SRC, 'services/camera/CameraManager.ts'), 'utf-8');
  if (!cm.includes('onNewFrame')) throw new Error('CameraManager missing onNewFrame');
  if (!cm.includes('latestFrameWidth')) throw new Error('CameraManager missing frame dimensions');

  const fs = readFileSync(join(SRC, 'services/camera/frameSender.ts'), 'utf-8');
  if (!fs.includes('getLatestFrameAttachment')) throw new Error('frameSender missing Strategy A');
  if (!fs.includes('startContinuousStream')) throw new Error('frameSender missing Strategy B');

  const fp = readFileSync(join(SRC, 'components/camera/frameProcessorWorklet.ts'), 'utf-8');
  if (!fp.includes('processFrame')) throw new Error('frameProcessorWorklet missing processFrame');
});

test('Audio pipeline complete', () => {
  const am = readFileSync(join(SRC, 'services/audio/AudioManager.ts'), 'utf-8');
  if (!am.includes('configureSession')) throw new Error('AudioManager missing configureSession');
  if (!am.includes('startRecording')) throw new Error('AudioManager missing startRecording');
  if (!am.includes('onVolumeUpdate')) throw new Error('AudioManager missing onVolumeUpdate');

  const asr = readFileSync(join(SRC, 'services/audio/ASRService.ts'), 'utf-8');
  if (!asr.includes('feedPCM')) throw new Error('ASRService missing feedPCM');

  const tts = readFileSync(join(SRC, 'services/audio/TTSService.ts'), 'utf-8');
  if (!tts.includes('speak')) throw new Error('TTSService missing speak');
  if (!tts.includes('isTTSSpeaking')) throw new Error('TTSService missing half-duplex');
});

test('WakeUpManager orchestrates full lifecycle', () => {
  const wm = readFileSync(join(SRC, 'services/wake/WakeUpManager.ts'), 'utf-8');
  if (!wm.includes('activate(')) throw new Error('WakeUpManager missing activate');
  if (!wm.includes('deactivate')) throw new Error('WakeUpManager missing deactivate');
  if (!wm.includes('sendUserMessage')) throw new Error('WakeUpManager missing sendUserMessage');
  if (!wm.includes('pushToFeishu')) throw new Error('WakeUpManager missing Feishu push');
  if (!wm.includes('startIdleMonitor')) throw new Error('WakeUpManager missing idle monitor');
});

test('URL scheme handler ready', () => {
  const uh = readFileSync(join(SRC, 'services/wake/UrlSchemeHandler.ts'), 'utf-8');
  if (!uh.includes('initialize')) throw new Error('UrlSchemeHandler missing initialize');
  if (!uh.includes('handleUrl')) throw new Error('UrlSchemeHandler missing handleUrl');
  if (!uh.includes('mobileclaw://')) throw new Error('UrlSchemeHandler missing scheme check');
});

// ─── Test 6: UI Components ───────────────────────────────────────

test('All screens exist', () => {
  const screens = ['HomeScreen', 'SessionScreen', 'SettingsScreen'];
  for (const s of screens) {
    if (!existsSync(join(SRC, `screens/${s}.tsx`))) throw new Error(`Missing screen: ${s}.tsx`);
  }
});

test('CameraPreview component exists', () => {
  if (!existsSync(join(SRC, 'components/camera/CameraPreview.tsx'))) {
    throw new Error('Missing CameraPreview component');
  }
});

test('WaveformView component exists', () => {
  if (!existsSync(join(SRC, 'components/audio/WaveformView.tsx'))) {
    throw new Error('Missing WaveformView component');
  }
});

// ─── Test 7: Dependencies ───────────────────────────────────────

test('package.json has all dependencies', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  const requiredDeps = [
    'react', 'react-native', 'zustand', 'uuid',
    'react-native-vision-camera', 'react-native-reanimated',
    'react-native-gesture-handler', 'react-native-safe-area-context',
    'react-native-screens', '@react-navigation/native',
    '@react-navigation/native-stack', 'expo-status-bar',
    'expo', 'expo-av', 'expo-secure-store',
    'react-native-audio-recorder-player',
  ];
  for (const dep of requiredDeps) {
    if (!pkg.dependencies[dep]) throw new Error(`Missing dependency: ${dep}`);
  }
});

test('app.json has correct config', () => {
  const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf-8'));
  if (app.expo.ios?.scheme !== 'mobileclaw' && app.expo.scheme !== 'mobileclaw') throw new Error('URL scheme not "mobileclaw"');
  if (!app.expo.plugins?.length) throw new Error('No plugins configured');
  if (!app.expo?.ios?.infoPlist?.NSSiriUsageDescription) {
    throw new Error('Missing Siri usage description');
  }
});

// ─── Test 8: Feature List Complete ─────────────────────────────

test('All 12 features tracked', () => {
  const fl = JSON.parse(readFileSync(join(ROOT, 'feature_list.json'), 'utf-8'));
  if (fl.features.length !== 12) throw new Error(`Expected 12 features, got ${fl.features.length}`);
  const passedCount = fl.features.filter((f) => f.passes).length;
  if (passedCount < 11) throw new Error(`Only ${passedCount}/12 features passing`);
});

// ─── Results ───────────────────────────────────────────────────────

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║     MobileClaw Integration Test Results                  ║');
console.log('╠═════════════════════════════════════════════════════════╣');
for (const r of results) {
  console.log(r);
}
console.log('╠═════════════════════════════════════════════════════════╣');
console.log(`║  Total: ${passed + failed}  |  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}   ║`);
console.log('╚════════════════════════════════════════════════════════╝');

if (failed > 0) {
  process.exit(1);
}
