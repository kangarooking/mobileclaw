import React from 'react';
import { ScrollView, View } from 'react-native';
import type { ChatMessage } from '@/types/session';
import { TranscriptBubble } from './TranscriptBubble';
import { ResponseBubble } from './ResponseBubble';

interface ChatLogListProps {
  messages: ChatMessage[];
  currentTranscript: string;
  aiResponseText: string;
  isTTSSpeaking: boolean;
}

export function ChatLogList({
  messages,
  currentTranscript,
  aiResponseText,
  isTTSSpeaking,
}: ChatLogListProps) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 14, paddingTop: 8, gap: 10 }}
      showsVerticalScrollIndicator={false}
    >
      {messages.map((msg) =>
        msg.role === 'user' ? (
          <TranscriptBubble
            key={msg.id}
            text={msg.content}
            footerLabel={
              msg.visionIntent === 'unknown'
                ? '等待视觉判定'
                : msg.hasVideoContext
                  ? `视觉 · ${msg.visionFrameCount ?? 0} 帧`
                  : '仅文本'
            }
          />
        ) : (
          <ResponseBubble
            key={msg.id}
            text={msg.content}
            footerLabel={msg.hasVideoContext ? '基于视觉上下文回复' : '回复'}
          />
        ),
      )}

      {currentTranscript ? (
        <TranscriptBubble text={currentTranscript} isLive footerLabel="实时转写" />
      ) : null}

      {aiResponseText ? (
        <ResponseBubble text={aiResponseText} isSpeaking={isTTSSpeaking} />
      ) : null}
    </ScrollView>
  );
}
