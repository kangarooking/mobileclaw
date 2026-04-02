# MobileClaw

MobileClaw 是一个面向 [OpenClaw](https://github.com/openclaw/openclaw) 的多模态移动客户端。  
它把手机变成一个“能看、能听、能说”的 AI 对讲终端：支持语音对话、摄像头预览、按需多帧视觉识别、TTS 播报和会话记录。

## 演示视频

### 语音对话演示

<video src="./语音对话.mp4" controls muted playsinline width="720"></video>

备用链接：[语音对话.mp4](./语音对话.mp4)

### 视觉识别演示

<video src="./mobileclaw视觉识别.mp4" controls muted playsinline width="720"></video>

备用链接：[mobileclaw视觉识别.mp4](./mobileclaw视觉识别.mp4)

## 截图预览

### 语音演示图

![语音演示图](./语音演示图.png)

### 视频演示图

![视频演示图](./视频演示图.png)

### 首页

![首页](./首页.jpg)

### 配置图

![配置图](./配置图.jpg)

## 当前状态

- 当前优先支持 `iOS`
- Android 工程已存在，但尚未完成完整验证
- 依赖本地或局域网中的 OpenClaw Gateway
- 视觉能力基于“语音窗口多帧采样”，不是持续视频流理解

## 核心能力

- `Tap to Talk` 语音对话
- 摄像头预览与语音窗口多帧采样
- 按需视觉上传，不是每轮都发图
- OpenClaw Gateway WebSocket 连接
- 豆包 ASR / 豆包 TTS
- 智谱小模型做视觉意图判定
- 会话记录展示与语音播报
- 自定义唤醒词，支持多个别名

## 界面说明

- 首页：网关入口、模式入口、系统状态概览
- 会话页：相机预览、对话记录、语音交互
- 设置页：Gateway、ASR/TTS、视觉模型、唤醒词等参数配置

## 仓库结构

```text
src/
├── components/      UI 组件
├── screens/         首页、会话页、设置页
├── services/
│   ├── audio/       ASR / TTS / 音频采集
│   ├── camera/      相机预览、帧缓存、图片附件
│   ├── gateway/     OpenClaw 连接与 RPC
│   ├── storage/     SecureStore / 配置存储
│   ├── vision/      视觉意图判断、多帧选择
│   └── wake/        会话编排
├── store/           Zustand 状态
├── types/           协议和配置类型
└── utils/           日志、兼容层、常量
```

## 运行要求

- Node.js 20+
- npm 或 pnpm
- Xcode 16+
- iPhone 真机
- 本机或局域网中的 OpenClaw Gateway

## 安装

```bash
npm install
```

如果你需要重新生成原生工程：

```bash
npx expo prebuild --clean --platform ios,android
```

## iOS 启动

```bash
npx expo run:ios --device
```

开发模式：

```bash
npm start
```

## 使用步骤

1. 启动本地 OpenClaw Gateway
2. 确保手机和电脑连接在同一个局域网
3. 打开 MobileClaw，进入设置页
4. 添加一个 Gateway 实例
5. 填入 `ws://你的电脑局域网IP:18789`
6. 填入 Gateway token
7. 配置 ASR / TTS / 视觉意图模型密钥
8. 返回首页，选择是否开启摄像头模式
9. 进入会话页后开始说话

## 配置说明

### Gateway

- 地址示例：`ws://192.168.1.6:18789`
- token 由 OpenClaw Gateway 配置提供
- iPhone 需要允许 `本地网络` 权限

### 豆包 ASR / TTS

- 凭证不写在仓库里
- 通过 App 设置页输入
- 敏感信息保存在 `expo-secure-store`

### 视觉意图模型

- 当前使用智谱兼容 OpenAI 格式接口
- 只用于判断“这一轮是否需要视觉”
- 命中视觉需求后，才会把语音窗口中采样出的多帧图片一起发给 OpenClaw

### 唤醒词

- 设置页支持自定义
- 支持多个别名，用逗号分隔
- 例如：`龙虾, 小爪`

## 当前限制

- 当前主要面向 iOS 真机使用
- Android 还没有完整联调
- OpenClaw 不同版本之间可能存在兼容差异
- 局域网模式下，iPhone 的本地网络权限和电脑防火墙会直接影响连接

## 开源说明

- 本仓库不包含任何真实 API key、token、secret
- 本地调试素材、临时脚本和 handoff 文档不会纳入仓库
- 如果你 fork 之后加入自己的测试脚本，建议继续通过环境变量注入密钥

## 安全建议

- 不要把 Gateway token、豆包凭证、智谱密钥提交到仓库
- 不要把 `ws://` 暴露到公网
- 如果要远程访问，请自行在受控环境下做反向代理或内网穿透

## License

MIT
