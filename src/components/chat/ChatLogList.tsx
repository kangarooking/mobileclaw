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
      contentContainerStyle={{ padding: 12, gap: 8 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Historical messages */}
      {messages.map((msg) =>
        msg.role === 'user' ? (
          <TranscriptBubble key={msg.id} text={msg.content} />
        ) : (
          <ResponseBubble key={msg.id} text={msg.content} />
        ),
      )}

      {/* Live transcript (current user speech) */}
      {currentTranscript ? (
        <TranscriptBubble text={currentTranscript} isLive />
      ) : null}

      {/* Current AI response */}
      {aiResponseText ? (
        <ResponseBubble text={aiResponseText} isSpeaking={isTTSSpeaking} />
      ) : null}
    </ScrollView>
  );
}
