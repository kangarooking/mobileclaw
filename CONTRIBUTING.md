# Contributing

欢迎提交 Issue 和 Pull Request。

## 提交前建议

- 先确认问题是否能稳定复现
- 如果是 UI 或交互问题，尽量附截图或录屏
- 如果是网关连接、ASR、TTS、视觉链路问题，附关键日志

## 本地开发

```bash
npm install
npx expo run:ios --device
```

## Pull Request 建议

- 保持改动聚焦，不要把无关重构混在一起
- 不要提交真实 token、API key、secret
- 如果修改了配置、安装步骤或能力边界，请同步更新 README

## 当前重点

- iOS 真机体验
- OpenClaw Gateway 连接稳定性
- 语音识别 / TTS / 视觉多帧流程
- UI 体验与错误处理
