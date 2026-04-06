import React, { useEffect, useState } from 'react';
import { Alert, View, Text, TextInput, TouchableOpacity, ScrollView, Switch, StyleSheet } from 'react-native';
import { useAppStore } from '@/store/useAppStore';
import { SecureStorage } from '@/services/storage/SecureStorage';

const HUD = {
  bg: '#01060c',
  panel: 'rgba(4, 16, 28, 0.9)',
  panelSoft: 'rgba(4, 16, 28, 0.62)',
  line: 'rgba(0, 229, 255, 0.18)',
  lineStrong: 'rgba(0, 229, 255, 0.42)',
  text: '#d9fbff',
  textMuted: '#82b2c4',
  accent: '#00e5ff',
  accentSoft: 'rgba(0, 229, 255, 0.08)',
  warn: '#ffb24d',
  danger: '#ff6670',
};

export function SettingsScreen({ navigation }: { navigation: any }) {
  const { config, addGateway, removeGateway, updateConfig, updateGateway, setActiveGateway, activeGateway } = useAppStore();
  const [newGwName, setNewGwName] = useState('');
  const [newGwUrl, setNewGwUrl] = useState('');
  const [newGwToken, setNewGwToken] = useState('');

  const [asrAppId, setAsrAppId] = useState('');
  const [asrAccessToken, setAsrAccessToken] = useState('');
  const [ttsAppId, setTtsAppId] = useState('');
  const [ttsAccessToken, setTtsAccessToken] = useState('');
  const [ttsSecretKey, setTtsSecretKey] = useState('');
  const [ttsResourceId, setTtsResourceId] = useState(config.tts.resourceId || '');
  const [ttsInstanceName, setTtsInstanceName] = useState(config.tts.voiceId || '');
  const [ttsVoiceType, setTtsVoiceType] = useState(config.tts.voiceType || '');
  const [visionApiKey, setVisionApiKey] = useState('');
  const [wakeWord, setWakeWord] = useState(config.wakeWord);
  const [speechFrameMaxCount, setSpeechFrameMaxCount] = useState(String(config.video.speechFrameMaxCount));
  const [replyTimeoutMs, setReplyTimeoutMs] = useState(String(config.video.replyTimeoutMs));
  const [editingGatewayId, setEditingGatewayId] = useState<string | null>(null);
  const [editingGatewayName, setEditingGatewayName] = useState('');
  const [editingGatewayUrl, setEditingGatewayUrl] = useState('');
  const [editingGatewayToken, setEditingGatewayToken] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const savedAppId = await SecureStorage.getASRAppId();
        if (savedAppId) setAsrAppId(savedAppId);
      } catch {}
      try {
        const savedToken = await SecureStorage.getASRAccessToken();
        if (savedToken) setAsrAccessToken(savedToken);
      } catch {}
      try {
        const savedTTSAppId = await SecureStorage.getTTSAppId();
        if (savedTTSAppId) setTtsAppId(savedTTSAppId);
        else {
          const savedAppId = await SecureStorage.getASRAppId();
          if (savedAppId) setTtsAppId(savedAppId);
        }
      } catch {}
      try {
        const savedTTSToken = await SecureStorage.getTTSAccessToken();
        if (savedTTSToken) setTtsAccessToken(savedTTSToken);
        else {
          const savedToken = await SecureStorage.getASRAccessToken();
          if (savedToken) setTtsAccessToken(savedToken);
        }
      } catch {}
      try {
        const savedTTSSecret = await SecureStorage.getTTSSecretKey();
        if (savedTTSSecret) setTtsSecretKey(savedTTSSecret);
      } catch {}
      try {
        const savedVisionApiKey = await SecureStorage.getVisionApiKey();
        if (savedVisionApiKey) setVisionApiKey(savedVisionApiKey);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    setTtsResourceId(config.tts.resourceId || '');
    setTtsInstanceName(config.tts.voiceId || '');
    setTtsVoiceType(config.tts.voiceType || '');
  }, [config.tts.resourceId, config.tts.voiceId, config.tts.voiceType]);

  useEffect(() => {
    setSpeechFrameMaxCount(String(config.video.speechFrameMaxCount));
    setReplyTimeoutMs(String(config.video.replyTimeoutMs));
  }, [config.video.speechFrameMaxCount, config.video.replyTimeoutMs]);

  useEffect(() => {
    setWakeWord(config.wakeWord);
  }, [config.wakeWord]);

  const handleSaveASRCredentials = async () => {
    if (asrAppId.trim()) {
      await SecureStorage.setASRAppId(asrAppId.trim());
    }
    if (asrAccessToken.trim()) {
      await SecureStorage.setASRAccessToken(asrAccessToken.trim());
    }
    updateConfig({
      asr: {
        ...config.asr,
        appId: asrAppId.trim() || undefined,
        accessToken: asrAccessToken.trim() || undefined,
      },
    });
    Alert.alert('保存成功', '语音识别凭证已保存。');
  };

  const handleSaveTTSCredentials = async () => {
    if (ttsAppId.trim()) {
      await SecureStorage.setTTSAppId(ttsAppId.trim());
    }
    if (ttsAccessToken.trim()) {
      await SecureStorage.setTTSAccessToken(ttsAccessToken.trim());
    }
    if (ttsSecretKey.trim()) {
      await SecureStorage.setTTSSecretKey(ttsSecretKey.trim());
    }

    updateConfig({
      tts: {
        ...config.tts,
        type: 'doubao',
        appId: ttsAppId.trim() || undefined,
        accessToken: ttsAccessToken.trim() || undefined,
        secretKey: ttsSecretKey.trim() || undefined,
        resourceId: ttsResourceId.trim() || undefined,
        cluster: undefined,
        voiceId: ttsInstanceName.trim() || undefined,
        voiceType: ttsVoiceType.trim() || undefined,
      },
    });
    Alert.alert('保存成功', '语音播报凭证已保存。');
  };

  const handleAddGateway = async () => {
    if (!newGwName.trim() || !newGwUrl.trim()) return;

    const id = addGateway({
      name: newGwName.trim(),
      wsUrl: newGwUrl.trim(),
      description: '',
      isActive: true,
      avatarEmoji: '🦞',
    });

    if (newGwToken.trim()) {
      await SecureStorage.setGatewayToken(id, newGwToken.trim());
    }

    setNewGwName('');
    setNewGwUrl('');
    setNewGwToken('');
    Alert.alert('保存成功', '网关实例已添加。');
  };

  const handleEditGateway = async (gatewayId: string) => {
    const gateway = config.gateways.find((item) => item.id === gatewayId);
    if (!gateway) return;
    const token = (await SecureStorage.getGatewayToken(gateway.id)) || '';
    setEditingGatewayId(gateway.id);
    setEditingGatewayName(gateway.name);
    setEditingGatewayUrl(gateway.wsUrl);
    setEditingGatewayToken(token);
  };

  const handleSaveGatewayEdit = async () => {
    if (!editingGatewayId) return;
    updateGateway(editingGatewayId, {
      name: editingGatewayName.trim() || '未命名网关',
      wsUrl: editingGatewayUrl.trim(),
    });
    if (editingGatewayToken.trim()) {
      await SecureStorage.setGatewayToken(editingGatewayId, editingGatewayToken.trim());
    } else {
      await SecureStorage.removeItem(`gw_${editingGatewayId}_token`);
    }
    setEditingGatewayId(null);
    setEditingGatewayName('');
    setEditingGatewayUrl('');
    setEditingGatewayToken('');
    Alert.alert('保存成功', '网关实例已更新。');
  };

  const handleCancelGatewayEdit = () => {
    setEditingGatewayId(null);
    setEditingGatewayName('');
    setEditingGatewayUrl('');
    setEditingGatewayToken('');
  };

  const handleSaveVisionApiKey = async () => {
    if (visionApiKey.trim()) {
      await SecureStorage.setVisionApiKey(visionApiKey.trim());
    } else {
      await SecureStorage.removeItem('vision_api_key');
    }
    Alert.alert('保存成功', '视觉意图识别凭证已保存。');
  };

  const handleSaveVideoSettings = () => {
    const nextSpeechFrameMaxCount = Math.max(1, Math.min(12, Number(speechFrameMaxCount) || config.video.speechFrameMaxCount));
    const nextReplyTimeoutMs = Math.max(30_000, Math.min(180_000, Number(replyTimeoutMs) || config.video.replyTimeoutMs));

    updateConfig({
      video: {
        ...config.video,
        speechFrameMaxCount: nextSpeechFrameMaxCount,
        replyTimeoutMs: nextReplyTimeoutMs,
      },
    });

    setSpeechFrameMaxCount(String(nextSpeechFrameMaxCount));
    setReplyTimeoutMs(String(nextReplyTimeoutMs));
    Alert.alert('保存成功', '视频与回复参数已保存。');
  };

  const handleSaveWakeWord = () => {
    const normalized = wakeWord
      .split(/[，,\n]/u)
      .map((item) => item.trim())
      .filter(Boolean)
      .join(', ');

    updateConfig({
      wakeWord: normalized || '龙虾',
    });

    setWakeWord(normalized || '龙虾');
    Alert.alert('保存成功', '唤醒词已保存。');
  };

  return (
    <View style={styles.container}>
      <View style={styles.haloLeft} />
      <View style={styles.haloRight} />

      <View style={styles.header}>
        <Text style={styles.kicker}>系统参数</Text>
        <Text style={styles.title}>链路校准台</Text>
        <Text style={styles.subtitle}>这里只做参数与凭证管理，不改变现有会话逻辑。</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Section title="网关实例" subtitle="接入 OpenClaw 的地址、名称与令牌。">
          <View style={styles.gatewayImportCallout}>
            <View style={styles.gatewayImportTextWrap}>
              <Text style={styles.gatewayImportTitle}>扫码导入更省事</Text>
              <Text style={styles.gatewayImportHint}>
                OpenClaw 所在机器执行 `openclaw qr` 可生成二维码。扫码导入后，下面的手填入口依然保留。
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.navigate('GatewayQrScanner')}
              style={styles.scanChip}
              activeOpacity={0.84}
            >
              <Text style={styles.scanChipText}>扫码</Text>
            </TouchableOpacity>
          </View>

          {config.gateways.map((gw) => (
            <View key={gw.id} style={styles.gatewayCard}>
              <View style={styles.gatewayRow}>
                <View style={styles.gatewayInfo}>
                  <Text style={styles.gatewayName}>{gw.avatarEmoji} {gw.name}</Text>
                  <Text style={styles.gatewayUrl}>{gw.wsUrl}</Text>
                  <Text style={styles.gatewayMeta}>
                    {activeGateway?.id === gw.id ? '当前使用中' : '未选中'}
                  </Text>
                </View>
                <View style={styles.gatewayActions}>
                  <TouchableOpacity onPress={() => setActiveGateway(gw)} style={styles.selectChip}>
                    <Text style={styles.selectChipText}>{activeGateway?.id === gw.id ? '已选中' : '设为当前'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleEditGateway(gw.id)} style={styles.editChip}>
                    <Text style={styles.editChipText}>编辑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeGateway(gw.id)} style={styles.deleteChip}>
                    <Text style={styles.deleteChipText}>删除</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}

          {editingGatewayId ? (
            <View style={styles.formBlock}>
              <Text style={styles.editTitle}>编辑网关</Text>
              <FormField
                value={editingGatewayName}
                onChangeText={setEditingGatewayName}
                placeholder="实例名称"
              />
              <FormField
                value={editingGatewayUrl}
                onChangeText={setEditingGatewayUrl}
                placeholder="WebSocket 地址"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <FormField
                value={editingGatewayToken}
                onChangeText={setEditingGatewayToken}
                placeholder="认证令牌"
                secureTextEntry
              />
              <Text style={styles.helperText}>扫码导入后的 token 也会在这里读取出来，方便确认和修改。手机接电脑时，地址请填局域网 IP，不要填 `127.0.0.1`。</Text>
              <View style={styles.editButtonRow}>
                <TouchableOpacity onPress={handleCancelGatewayEdit} style={styles.secondaryInlineButton} activeOpacity={0.84}>
                  <Text style={styles.secondaryInlineButtonText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveGatewayEdit} style={styles.primaryInlineButton} activeOpacity={0.84}>
                  <Text style={styles.primaryInlineButtonText}>保存修改</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={styles.formBlock}>
            <FormField
              value={newGwName}
              onChangeText={setNewGwName}
              placeholder="实例名称，例如：家里网关"
            />
            <FormField
              value={newGwUrl}
              onChangeText={setNewGwUrl}
              placeholder="WebSocket 地址，例如：ws://192.168.1.6:18789"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <FormField
              value={newGwToken}
              onChangeText={setNewGwToken}
              placeholder="认证令牌"
              secureTextEntry
            />
            <Text style={styles.helperText}>手机连接电脑上的 OpenClaw 时，不要填写 `127.0.0.1` 或 `localhost`，要填电脑的局域网 IP。</Text>
            <PrimaryButton label="添加网关" onPress={handleAddGateway} />
          </View>
        </Section>

        <Section title="语音总览" subtitle="当前语音链路的运行模式。">
          <InfoGrid
            items={[
              { label: '唤醒词', value: config.wakeWord },
              { label: '识别引擎', value: config.asr.type },
              { label: '播报引擎', value: config.tts.type },
            ]}
          />
        </Section>

        <Section title="唤醒词" subtitle="支持自定义多个唤醒词，用逗号分隔，识别时会自动兼容。">
          <View style={styles.formBlock}>
            <FormField
              value={wakeWord}
              onChangeText={setWakeWord}
              placeholder="例如：龙虾， 小爪"
            />
            <Text style={styles.helperText}>
              例子：`龙虾` 或 `龙虾, 小爪, claw`。保存后下一轮语音识别立即生效。
            </Text>
            <PrimaryButton label="保存唤醒词" onPress={handleSaveWakeWord} />
          </View>
        </Section>

        {config.asr.type === 'doubao' ? (
          <Section title="语音识别凭证" subtitle="豆包 ASR 的 App ID 与 Access Token。">
            <View style={styles.formBlock}>
              <FormField
                value={asrAppId}
                onChangeText={setAsrAppId}
                placeholder="App ID"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <FormField
                value={asrAccessToken}
                onChangeText={setAsrAccessToken}
                placeholder="Access Token"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <PrimaryButton label="保存语音识别凭证" onPress={handleSaveASRCredentials} />
            </View>
          </Section>
        ) : null}

        {config.tts.type === 'doubao' ? (
          <Section title="语音播报凭证" subtitle="豆包 TTS 在线播报所需参数。">
            <View style={styles.formBlock}>
              <FormField
                value={ttsAppId}
                onChangeText={setTtsAppId}
                placeholder="App ID"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <FormField
                value={ttsAccessToken}
                onChangeText={setTtsAccessToken}
                placeholder="Access Token"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <FormField
                value={ttsSecretKey}
                onChangeText={setTtsSecretKey}
                placeholder="Secret Key，可选"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <FormField
                value={ttsResourceId}
                onChangeText={setTtsResourceId}
                placeholder="资源 ID，默认 seed-tts-2.0"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <FormField
                value={ttsInstanceName}
                onChangeText={setTtsInstanceName}
                placeholder="实例名，可选"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <FormField
                value={ttsVoiceType}
                onChangeText={setTtsVoiceType}
                placeholder="音色标识 speaker"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <PrimaryButton label="保存语音播报凭证" onPress={handleSaveTTSCredentials} />
            </View>
          </Section>
        ) : null}

        <Section title="视频与视觉" subtitle="控制多帧采样与回复等待时间。">
          <InfoGrid
            items={[
              { label: '分辨率', value: config.video.resolution },
              { label: '帧率', value: `${config.video.fps} fps` },
              { label: 'JPEG 质量', value: `${Math.round(config.video.jpegQuality * 100)}%` },
              { label: '视觉模式', value: config.video.visionMode },
              { label: '最大帧数', value: String(config.video.speechFrameMaxCount) },
              { label: '回复超时', value: `${Math.round(config.video.replyTimeoutMs / 1000)} 秒` },
            ]}
          />

          <View style={styles.formBlock}>
            <FormField
              value={speechFrameMaxCount}
              onChangeText={setSpeechFrameMaxCount}
              placeholder="语音窗口最大帧数，范围 1 到 12"
              keyboardType="number-pad"
            />
            <FormField
              value={replyTimeoutMs}
              onChangeText={setReplyTimeoutMs}
              placeholder="回复超时，单位毫秒，范围 30000 到 180000"
              keyboardType="number-pad"
            />
            <Text style={styles.helperText}>
              最大帧数用于限制本轮最多附带多少张图；回复超时用于等待 OpenClaw 较慢的视觉回复。
            </Text>
            <PrimaryButton label="保存视频参数" onPress={handleSaveVideoSettings} tint="warn" />
          </View>
        </Section>

        <Section title="视觉意图模型" subtitle="智谱 glm-4.7-flash，用于兜底判断本轮是否需要视觉。">
          <View style={styles.formBlock}>
            <FormField
              value={visionApiKey}
              onChangeText={setVisionApiKey}
              placeholder="智谱 API Key"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.helperText}>未填写时会退回本地规则判断，不会影响基础会话能力。</Text>
            <PrimaryButton label="保存视觉模型密钥" onPress={handleSaveVisionApiKey} />
          </View>
        </Section>

        <Section title="历史推送" subtitle="是否将历史记录推送到飞书。">
          <View style={styles.switchRow}>
            <View style={styles.switchTextWrap}>
              <Text style={styles.switchTitle}>启用飞书推送</Text>
              <Text style={styles.switchHint}>打开后会按现有逻辑向飞书 Webhook 发送记录。</Text>
            </View>
            <Switch
              value={config.feishu.enabled}
              onValueChange={(value) => updateConfig({ feishu: { ...config.feishu, enabled: value } })}
              trackColor={{ false: '#173040', true: '#0f7e8d' }}
              thumbColor={config.feishu.enabled ? '#00e5ff' : '#8aa5b0'}
            />
          </View>
          {config.feishu.webhookUrl ? (
            <Text style={styles.webhookHint}>Webhook：{config.feishu.webhookUrl.slice(0, 54)}...</Text>
          ) : null}
        </Section>

        <View style={styles.footer}>
          <Text style={styles.footerText}>MobileClaw v1.0.0 · 视觉、语音与网关链路参数已集中到这里。</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      {children}
    </View>
  );
}

function FormField(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor="#537388"
      style={styles.input}
      {...props}
    />
  );
}

function PrimaryButton({
  label,
  onPress,
  tint = 'accent',
}: {
  label: string;
  onPress: () => void;
  tint?: 'accent' | 'warn';
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.primaryButton, tint === 'warn' && styles.primaryButtonWarn]}
      activeOpacity={0.84}
    >
      <Text style={[styles.primaryButtonText, tint === 'warn' && styles.primaryButtonTextWarn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function InfoGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <View style={styles.infoGrid}>
      {items.map((item) => (
        <View key={`${item.label}-${item.value}`} style={styles.infoCard}>
          <Text style={styles.infoLabel}>{item.label}</Text>
          <Text numberOfLines={1} style={styles.infoValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: HUD.bg,
  },
  haloLeft: {
    position: 'absolute',
    top: -30,
    left: -70,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
  },
  haloRight: {
    position: 'absolute',
    right: -100,
    bottom: 120,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 229, 255, 0.05)',
  },
  header: {
    paddingTop: 58,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  kicker: {
    color: HUD.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.2,
  },
  title: {
    marginTop: 6,
    color: HUD.text,
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 6,
    color: HUD.textMuted,
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 280,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 36,
    gap: 14,
  },
  section: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: HUD.line,
    backgroundColor: HUD.panel,
    padding: 14,
    gap: 12,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    color: HUD.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  sectionSubtitle: {
    color: HUD.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  gatewayImportCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: HUD.line,
    backgroundColor: HUD.accentSoft,
    padding: 12,
  },
  gatewayImportTextWrap: {
    flex: 1,
  },
  gatewayImportTitle: {
    color: HUD.text,
    fontSize: 14,
    fontWeight: '800',
  },
  gatewayImportHint: {
    marginTop: 4,
    color: HUD.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  scanChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: HUD.lineStrong,
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  scanChipText: {
    color: HUD.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  gatewayCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.12)',
    backgroundColor: HUD.panelSoft,
    padding: 12,
  },
  gatewayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  gatewayInfo: {
    flex: 1,
  },
  gatewayName: {
    color: HUD.text,
    fontSize: 15,
    fontWeight: '800',
  },
  gatewayUrl: {
    marginTop: 4,
    color: HUD.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  gatewayMeta: {
    marginTop: 6,
    color: HUD.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  gatewayActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  selectChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.24)',
    backgroundColor: 'rgba(4, 31, 44, 0.84)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectChipText: {
    color: HUD.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  editChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.18)',
    backgroundColor: 'rgba(6, 22, 34, 0.72)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editChipText: {
    color: HUD.text,
    fontSize: 12,
    fontWeight: '700',
  },
  deleteChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 102, 112, 0.26)',
    backgroundColor: 'rgba(36, 10, 16, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteChipText: {
    color: '#ff8f98',
    fontSize: 12,
    fontWeight: '700',
  },
  editTitle: {
    color: HUD.text,
    fontSize: 15,
    fontWeight: '800',
  },
  editButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryInlineButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.14)',
    backgroundColor: 'rgba(4, 17, 27, 0.76)',
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryInlineButtonText: {
    color: HUD.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  primaryInlineButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: HUD.lineStrong,
    backgroundColor: HUD.accentSoft,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryInlineButtonText: {
    color: HUD.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  formBlock: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.12)',
    backgroundColor: 'rgba(2, 10, 18, 0.54)',
    padding: 12,
    gap: 10,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.14)',
    backgroundColor: 'rgba(2, 10, 18, 0.72)',
    color: HUD.text,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  primaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: HUD.lineStrong,
    backgroundColor: HUD.accentSoft,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonWarn: {
    borderColor: 'rgba(255, 178, 77, 0.36)',
    backgroundColor: 'rgba(38, 22, 4, 0.72)',
  },
  primaryButtonText: {
    color: HUD.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  primaryButtonTextWarn: {
    color: HUD.warn,
  },
  helperText: {
    color: HUD.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoCard: {
    width: '48%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.12)',
    backgroundColor: HUD.panelSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 68,
    justifyContent: 'space-between',
  },
  infoLabel: {
    color: HUD.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  infoValue: {
    color: HUD.text,
    fontSize: 14,
    fontWeight: '800',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  switchTextWrap: {
    flex: 1,
  },
  switchTitle: {
    color: HUD.text,
    fontSize: 15,
    fontWeight: '800',
  },
  switchHint: {
    marginTop: 4,
    color: HUD.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  webhookHint: {
    color: HUD.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 6,
  },
  footerText: {
    color: '#567789',
    fontSize: 12,
    textAlign: 'center',
  },
});
