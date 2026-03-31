import React from 'react';
import { View, Text } from 'react-native';

interface TranscriptBubbleProps {
  text: string;
  isLive?: boolean;   // True if ASR is still processing
}

export function TranscriptBubble({ text, isLive }: TranscriptBubbleProps) {
  if (!text) return null;

  return (
    <View style={{
      alignSelf: 'flex-start',
      backgroundColor: isLive ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)',
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
      maxWidth: '80%',
      borderLeftWidth: 3,
      borderLeftColor: isLive ? '#3b82f6' : '#3b82f6',
    }}>
      <Text style={{ color: '#e2e8f0', fontSize: 15, lineHeight: 22 }}>
        {text}
        {isLive && (
          <Text style={{ color: '#3b82f6' }}> ▊</Text>
        )}
      </Text>
    </View>
  );
}
