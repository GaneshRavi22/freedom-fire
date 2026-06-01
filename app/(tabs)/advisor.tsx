import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { useAdvisorStore, type AdvisorMessage } from '@/stores/advisor.store';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '@/constants/theme';
import { track } from '@/lib/analytics';

const SUGGESTIONS = [
  'Am I on track for FIRE?',
  "What's my biggest spending leak?",
  'How much earlier if I save ₹5k more?',
];

function ChatBubble({ message, isStreaming }: { message: AdvisorMessage; isStreaming?: boolean }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
      {!isUser && (
        <View style={styles.avatarDot}>
          <Ionicons name="sparkles" size={12} color={Colors.accent} />
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
          {message.content}
          {isStreaming ? <Text style={styles.cursor}>▊</Text> : null}
        </Text>
      </View>
    </View>
  );
}

export default function AdvisorScreen() {
  const { user, profile } = useAuthStore();
  const { messages, streaming, sendMessage, clearConversation } = useAdvisorStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    React.useCallback(() => {
      if (user?.id) track(user.id, 'screen_viewed', { screen: 'advisor' });
    }, [user?.id])
  );

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, streaming]);

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || !user?.id || streaming) return;
    setInput('');
    await sendMessage(user.id, content);
  };

  const name = profile?.name ?? 'there';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="sparkles" size={32} color={Colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>Hi {name}!</Text>
            <Text style={styles.emptySubtitle}>
              I know your numbers. Ask me anything about your FIRE journey.
            </Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={styles.suggestionChip}
                  onPress={() => handleSend(s)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          messages.map((msg, i) => (
            <ChatBubble
              key={msg.id}
              message={msg}
              isStreaming={streaming && i === messages.length - 1 && msg.role === 'assistant'}
            />
          ))
        )}
        {streaming && messages[messages.length - 1]?.role === 'user' && (
          <View style={[styles.bubbleRow, styles.bubbleRowAssistant]}>
            <View style={styles.avatarDot}>
              <Ionicons name="sparkles" size={12} color={Colors.accent} />
            </View>
            <View style={[styles.bubble, styles.bubbleAssistant, styles.thinkingBubble]}>
              <ActivityIndicator size="small" color={Colors.accent} />
              <Text style={styles.thinkingText}>Checking your data…</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputRow}>
        {messages.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={clearConversation} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask your advisor…"
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={() => handleSend()}
          editable={!streaming}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || streaming) && styles.sendBtnDisabled]}
          onPress={() => handleSend()}
          disabled={!input.trim() || streaming}
          activeOpacity={0.8}
        >
          <Ionicons name="send" size={18} color={input.trim() && !streaming ? Colors.primary : Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.accent}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  suggestions: {
    gap: Spacing.sm,
    width: '100%',
  },
  suggestionChip: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  suggestionText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
    alignItems: 'flex-end',
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowAssistant: {
    justifyContent: 'flex-start',
  },
  avatarDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${Colors.accent}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.xs,
    flexShrink: 0,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  bubbleUser: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: FontSize.base,
    lineHeight: 22,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },
  bubbleTextAssistant: {
    color: Colors.textPrimary,
  },
  cursor: {
    color: Colors.accent,
  },
  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  thinkingText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginLeft: Spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.md,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  clearBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    maxHeight: 120,
    minHeight: 44,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${Colors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: Colors.surface,
  },
});
