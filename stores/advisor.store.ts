import { create } from 'zustand';
import { supabase } from '@/services/supabase';

export interface AdvisorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface AdvisorState {
  messages: AdvisorMessage[];
  streaming: boolean;
  streamingContent: string;

  sendMessage: (userId: string, content: string) => Promise<void>;
  clearConversation: () => void;
}

export const useAdvisorStore = create<AdvisorState>((set, get) => ({
  messages: [],
  streaming: false,
  streamingContent: '',

  sendMessage: async (userId, content) => {
    const userMsg: AdvisorMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    set((s) => ({ messages: [...s.messages, userMsg], streaming: true, streamingContent: '' }));

    try {
      const history = get().messages.slice(-19).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke('financial-advisor-chat', {
        body: { userId, message: content, conversationHistory: history },
      });

      if (error) throw error;

      let rawText = '';
      if (data instanceof Response) {
        rawText = await data.text();
      } else if (typeof data === 'string') {
        rawText = data;
      }

      let assistantText = '';
      const lines = rawText.split('\n').filter((l: string) => l.startsWith('data: '));
      for (const line of lines) {
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'text_delta') assistantText += event.text;
        } catch {
          // skip malformed lines
        }
      }

      const assistantMsg: AdvisorMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantText || 'I encountered an issue. Please try again.',
        timestamp: Date.now(),
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        streaming: false,
        streamingContent: '',
      }));
    } catch (err: any) {
      const errorMsg: AdvisorMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, I ran into an issue. Please check your connection and try again.',
        timestamp: Date.now(),
      };
      set((s) => ({
        messages: [...s.messages, errorMsg],
        streaming: false,
        streamingContent: '',
      }));
    }
  },

  clearConversation: () => set({ messages: [], streamingContent: '' }),
}));
