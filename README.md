# MobileClaw

MobileClaw 是一个面向 [OpenClaw](https://github.com/openclaw/openclaw) 的多模态移动客户端。  
它把手机变成一个“能看、能听、能说”的 AI 对讲终端：支持语音对话、摄像头预览、按需多帧视觉识别、TTS 播报和会话记录。

<p>
  <a href="https://github.com/kangarooking/mobileclaw/releases/tag/v1.0.0">
    <img alt="下载 APK" src="https://img.shields.io/badge/下载%20APK-v1.0.0-cc2b1d?style=for-the-badge" />
  </a>
  <a href="https://github.com/kangarooking/mobileclaw/releases/download/v1.0.0/MobileClaw-1.0.0-android.apk">
    <img alt="Android APK" src="https://img.shields.io/badge/Android-直接安装-1f8b4c?style=for-the-badge" />
  </a>
</p>

## 演示视频

### 语音对话演示

<video src="./语音对话.mp4" controls muted playsinline width="720"></video>

备用链接：[语音对话.mp4](./语音对话.mp4)

### 视觉识别演示

<video src="./mobileclaw视觉识别.mp4" controls muted playsinline width="720"></video>

备用链接：[mobileclaw视觉识别.mp4](./mobileclaw视觉识别.mp4)

## 截图预览

<table>
  <tr>
    <td align="center">
      <img src="./语音演示图.png" alt="语音演示图" width="100%" />
      <br />
      <sub>语音演示图</sub>
    </td>
    <td align="center">
      <img src="./视频演示图.png" alt="视频演示图" width="100%" />
      <br />
      <sub>视频演示图</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="./首页.jpg" alt="首页" width="100%" />
      <br />
      <sub>首页</sub>
    </td>
    <td align="center">
      <img src="./配置图.jpg" alt="配置图" width="100%" />
      <br />
      <sub>配置图</sub>
    </td>
  </tr>
</table>

## 当前状态

- `iOS` 已完成主链路验证，可走 `TestFlight` 分发
- `Android` 已具备发布版构建能力，可走 `APK` 分发
- 已区分 `development / preview / production` 三种构建形态
- 首次打开 App 支持引导式接入：权限授权、扫码导入 Gateway、保留手填地址与 token
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
- pnpm
- Xcode 16+（iOS）
- Android Studio / Android SDK / JDK 17（Android）
- iPhone 真机或 Android 真机
- 本机或局域网中的 OpenClaw Gateway

## 安装

```bash
pnpm install
```

如果你需要重新生成原生工程：

```bash
npx expo prebuild --clean --platform ios,android
```

## iOS 开发启动

```bash
npx expo run:ios --device
```

开发模式：

```bash
npm start
```

## Android 开发启动

先准备 Android 构建环境：

```bash
pnpm run android:env
pnpm run android:check
```

真机开发构建：

```bash
npx expo run:android
```

如果已经装过开发版，也可以单独启动 Metro：

```bash
pnpm start
```

常见开发地址：

```text
exp://你的电脑局域网IP:8081
```

例如：

```text
exp://192.168.1.6:8081
```

如果 Android Dev Client 需要完整地址，也可以使用：

```text
exp+mobileclaw://expo-development-client/?url=http%3A%2F%2F192.168.1.6%3A8081
```

## 普通用户怎么安装

### Android

使用发布版 APK：

```bash
pnpm run build:android:preview
pnpm run build:android:production
```

- `preview` 适合内测分发
- `production` 适合正式分发
- 产物可以上传到 GitHub Releases、官网或群文件，用户下载后直接安装

### iOS

使用 EAS 构建后上传 TestFlight：

```bash
pnpm run build:ios:preview
pnpm run build:ios:production
```

- `preview` 适合小范围测试
- `production` 适合提交 App Store Connect / TestFlight

## 首次使用流程

1. 启动本地或局域网中的 OpenClaw Gateway
2. 确保手机和 Gateway 所在设备在同一网络，或 Gateway 已有公网可达地址
3. 打开 MobileClaw，完成首次引导
4. 授权麦克风和相机
5. 推荐点击“扫码导入”
6. 在 OpenClaw 所在机器执行 `openclaw qr`
7. 用 MobileClaw 扫描该二维码，自动导入 Gateway 地址
8. 如果当前 OpenClaw 二维码里只有 `bootstrapToken`，还需要到“参数 -> 网关实例 -> 编辑”里手动补填真正的 Gateway token
9. 如果不方便扫码，也可以手动填写 `ws://...` 和 token
10. 返回首页，开启语音或视觉会话

## 使用步骤（手动模式）

1. 启动本地 OpenClaw Gateway
2. 确保手机和电脑连接在同一个局域网
3. 打开 MobileClaw，进入设置页
4. 添加一个 Gateway 实例
5. 填入 `ws://你的电脑局域网IP:18789`
6. 填入 Gateway token
7. 配置 ASR / TTS / 视觉意图模型密钥
8. 返回首页，选择是否开启摄像头模式
9. 进入会话页后开始说话

### Android 首次接入补充

Android 开发版第一次连 Gateway 时，OpenClaw 可能会拒绝并提示 `pairing required`。  
这是正常的设备配对流程，不是配置错误。

在 OpenClaw 所在机器上批准设备：

```bash
openclaw devices list
openclaw devices approve <requestId>
```

批准后，再回到 Android 端重新进入会话即可。

## 配置说明

### Gateway

- 地址示例：`ws://192.168.1.6:18789`
- token 由 OpenClaw Gateway 配置提供
- 推荐使用扫码导入而不是手填
- 二维码获取方式：在 OpenClaw 所在机器执行 `openclaw qr`
- 当前 OpenClaw 的二维码可能只包含 `bootstrapToken`，不一定等于 `gateway.auth.token`
- 如果扫码后仍提示 `gateway token mismatch`，请在 App 中手动补填真正的 Gateway token
- iPhone 需要允许 `本地网络` 权限
- Android 开发版首次连接可能需要 Gateway 配对批准

### 豆包 ASR / TTS

- 凭证不写在仓库里
- 通过 App 设置页输入
- 敏感信息保存在 `expo-secure-store`
- 当前项目默认参数：
  - ASR endpoint: `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream`
  - ASR resourceId: `volc.bigasr.sauc.duration`
  - TTS address: `wss://openspeech.bytedance.com`
  - TTS uri: `/api/v3/tts/bidirection`
  - TTS resourceId: `seed-tts-2.0`

### 视觉意图模型

- 当前使用智谱兼容 OpenAI 格式接口
- 只用于判断“这一轮是否需要视觉”
- 命中视觉需求后，才会把语音窗口中采样出的多帧图片一起发给 OpenClaw

### 唤醒词

- 设置页支持自定义
- 支持多个别名，用逗号分隔
- 例如：`龙虾, 小爪`

## 当前限制

- Android 目前仍以开发版和真机联调为主
- Android ASR/TTS 虽已接入，但仍建议在真实设备上继续做兼容性验证
- OpenClaw 不同版本之间可能存在兼容差异
- 局域网模式下，手机的本地网络访问、电脑防火墙、Gateway 配对状态会直接影响连接

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
