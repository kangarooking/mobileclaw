import React from 'react';
import { View, Text } from 'react-native';

interface ResponseBubbleProps {
  text: string;
  isSpeaking?: boolean;
}

export function ResponseBubble({ text, isSpeaking }: ResponseBubbleProps) {
  if (!text) return null;

  return (
    <View style={{
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(168,85,247,0.12)',
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
      maxWidth: '80%',
      borderLeftWidth: 3,
      borderLeftColor: '#a855f7',
    }}>
      <Text style={{ color: '#e2e8f0', fontSize: 15, lineHeight: 22 }}>
        {text}
      </Text>
      {isSpeaking && (
        <View style={{ flexDirection: 'row', gap: 3, marginTop: 6 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{
              width: 4,
              height: 12 + Math.sin(Date.now() / 200 + i) * 6,
              backgroundColor: '#a855f7',
              borderRadius: 2,
            }} />
          ))}
        </View>
      )}
    </View>
  );
}
