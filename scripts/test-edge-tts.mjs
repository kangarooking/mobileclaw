#!/usr/bin/env node
/**
 * test-edge-tts.mjs
 *
 * Edge TTS 合成测试 — 验证免费 TTS 路径可用性
 * 无需 API Key，直接调用 Microsoft Edge TTS REST API
 *
 * Run: node scripts/test-edge-tts.mjs
 */

let passed = 0;
let failed = 0;

function log(tag, msg) {
  console.log(`[${new Date().toLocaleTimeString()}] [${tag}] ${msg}`);
}

function pass(name) { passed++; log('PASS', name); }
function fail(name, err) { failed++; log('FAIL', `${name}: ${err}`); }

// ─── Test: Edge TTS SSML Synthesis ─────────────────────────────

async function testEdgeTTS() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     Edge TTS Synthesis Test                            ║');
  console.log('╚═════════════════════════════════════════════════════════╝\n');

  const SSML_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
  <voice name="zh-CN-XiaoxiaoNeural">
    <prosody rate="+0%">你好，我是 MobileClaw 的语音合成测试。龙虾对讲机，随时待命！</prosody>
  </voice>
</speak>`;

  const ENDPOINT = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud/connections/v1';
  const URL = `https://${ENDPOINT}?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4`;

  // Test 1: HTTP POST to Edge TTS
  log('TTS', `POST ${URL}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'MobileClaw/1.0',
      },
      body: SSML_TEMPLATE,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    log('HTTP', `Status: ${response.status} ${response.statusText}`);
    log('HTTP', `Content-Type: ${response.headers.get('content-type')}`);
    log('HTTP', `Content-Length: ${response.headers.get('content-length') || '(unknown)'}`);

    if (!response.ok) {
      const errBody = await response.text();
      fail('HTTP response', `${response.status}: ${errBody.slice(0, 200)}`);
      return;
    }

    pass(`HTTP ${response.ok ? response.status : 'non-2xx'} response received`);

    // Test 2: Receive audio data
    const contentType = response.headers.get('content-type') || '';
    const buffer = await response.arrayBuffer();
    const byteLength = buffer.byteLength;

    log('AUDIO', `Received ${byteLength} bytes (${(byteLength / 1024).toFixed(1)} KB)`);
    log('AUDIO', `Type: ${contentType}`);

    if (byteLength < 100) {
      // Too small to be valid audio - might be error JSON
      const text = new TextDecoder().decode(buffer);
      fail('Audio data too small', text);
      return;
    }

    pass(`Audio data received (${(byteLength / 1024).toFixed(1)} KB)`);

    // Check for MP3 magic bytes (ID3 tag or MP3 frame sync)
    const bytes = new Uint8Array(buffer);
    const isMP3 = (bytes[0] === 0xFF && bytes[1] === 0xFB) ||
                   (bytes[0] === 0xFF && bytes[1] === 0xF3) ||
                   (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33); // ID3

    if (isMP3) {
      pass('Valid MP3 audio format detected');
    } else {
      log('WARN', `First bytes: ${Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2,'0')).join(' ')}`);
      log('INFO', 'Format may not be MP3 (could be raw PCM or other codec)');
    }

    // Save the audio file so user can play it
    const { writeFileSync } = await import('fs');
    const outputPath = '/tmp/edge-tts-test-output.mp3';
    writeFileSync(outputPath, Buffer.from(bytes));
    log('FILE', `Audio saved to: ${outputPath}`);
    pass(`Audio saved to ${outputPath}`);

  } catch (error) {
    if (error.name === 'AbortError') {
      fail('Request timeout', 'No response within 15s');
    } else {
      fail('Fetch error', error.message);
    }
  }

  // Results
  console.log('\n╔═════════════════════════════════════════════════════════╗');
  console.log(`║  Total: ${passed + failed}  |  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}   ║`);
  console.log('╚════════════════════════════════════════════════════════╝\n');

  if (passed > 0) {
    console.log('💡 You can play the TTS output:');
    console.log(`   open /tmp/edge-tts-test-output.mp3`);
    console.log('   afplay /tmp/edge-tts-test-output.mp3\n');
  }

  if (failed > 0) process.exit(1);
}

testEdgeTTS().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
