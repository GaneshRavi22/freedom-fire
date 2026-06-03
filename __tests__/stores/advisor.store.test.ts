import { act } from '@testing-library/react-native';
import { useAdvisorStore } from '@/stores/advisor.store';

jest.mock('@/services/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
  },
}));

import { supabase } from '@/services/supabase';

const invokeMock = supabase.functions.invoke as jest.Mock;

beforeEach(() => {
  useAdvisorStore.setState({ messages: [], streaming: false, streamingContent: '' });
  jest.clearAllMocks();
});

// ── sendMessage ───────────────────────────────────────────────────────────────

describe('sendMessage — message state', () => {
  it('appends user message to state immediately before the await resolves', async () => {
    let capturedMessages: typeof useAdvisorStore.getState.arguments = [];
    invokeMock.mockImplementationOnce(async () => {
      capturedMessages = [...useAdvisorStore.getState().messages];
      return { data: null, error: null };
    });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'Hello');
    });

    expect(capturedMessages[0]).toMatchObject({ role: 'user', content: 'Hello' });
  });

  it('adds message at the end of the list, not the beginning', async () => {
    useAdvisorStore.setState({
      messages: [{ id: 'old', role: 'user', content: 'old msg', timestamp: 0 }],
      streaming: false,
      streamingContent: '',
    });
    invokeMock.mockResolvedValue({ data: { content: 'reply' }, error: null });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'new msg');
    });

    const msgs = useAdvisorStore.getState().messages;
    expect(msgs[0].content).toBe('old msg');
    expect(msgs[1].content).toBe('new msg');
  });

  it('each message gets a unique id', async () => {
    invokeMock.mockResolvedValue({ data: { content: 'reply' }, error: null });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'Hi');
    });

    const msgs = useAdvisorStore.getState().messages;
    const ids = msgs.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each message has a timestamp', async () => {
    invokeMock.mockResolvedValue({ data: { content: 'reply' }, error: null });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'Hi');
    });

    for (const msg of useAdvisorStore.getState().messages) {
      expect(msg.timestamp).toBeGreaterThan(0);
    }
  });
});

describe('sendMessage — streaming state', () => {
  it('sets streaming: true before invoke resolves', async () => {
    let streamingDuringCall = false;
    invokeMock.mockImplementationOnce(async () => {
      streamingDuringCall = useAdvisorStore.getState().streaming;
      return { data: null, error: null };
    });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'Hi');
    });

    expect(streamingDuringCall).toBe(true);
  });

  it('sets streaming: false after successful response', async () => {
    invokeMock.mockResolvedValue({ data: { content: 'ok' }, error: null });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'Hi');
    });

    expect(useAdvisorStore.getState().streaming).toBe(false);
  });

  it('sets streaming: false when invoke throws', async () => {
    invokeMock.mockRejectedValue(new Error('network'));

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'Hi');
    });

    expect(useAdvisorStore.getState().streaming).toBe(false);
  });

  it('sets streaming: false on supabase error object', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'Edge Function error' } });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'Hi');
    });

    expect(useAdvisorStore.getState().streaming).toBe(false);
  });
});

describe('sendMessage — Edge Function invocation', () => {
  it('calls financial-advisor-chat with userId and message', async () => {
    invokeMock.mockResolvedValue({ data: null, error: null });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-42', 'Am I on track for FIRE?');
    });

    expect(invokeMock).toHaveBeenCalledWith(
      'financial-advisor-chat',
      expect.objectContaining({
        body: expect.objectContaining({
          userId: 'user-42',
          message: 'Am I on track for FIRE?',
        }),
      })
    );
  });

  it('passes existing conversation history to invoke, including the new user message', async () => {
    // The store appends the user message to state BEFORE building the history slice,
    // so the Edge Function receives the full context including the current turn.
    useAdvisorStore.setState({
      messages: [
        { id: 'a', role: 'user', content: 'first question', timestamp: 1 },
        { id: 'b', role: 'assistant', content: 'first answer', timestamp: 2 },
      ],
      streaming: false,
      streamingContent: '',
    });
    invokeMock.mockResolvedValue({ data: null, error: null });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'follow-up');
    });

    const { conversationHistory } = invokeMock.mock.calls[0][1].body;
    expect(conversationHistory).toEqual([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'follow-up' },
    ]);
  });

  it('limits history to at most 19 messages', async () => {
    // 18 prior messages + 1 new user message = 19 sent (the slice cap)
    const priorHistory = Array.from({ length: 18 }, (_, i) => ({
      id: String(i),
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg ${i}`,
      timestamp: i,
    }));
    useAdvisorStore.setState({ messages: priorHistory, streaming: false, streamingContent: '' });
    invokeMock.mockResolvedValue({ data: null, error: null });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'new msg');
    });

    const { conversationHistory } = invokeMock.mock.calls[0][1].body;
    expect(conversationHistory).toHaveLength(19);
  });

  it('drops oldest messages to stay within the 19-message cap', async () => {
    // 25 prior + 1 new = 26 total → slice(-19) = last 19 = items [7..24] + new
    const priorHistory = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg ${i}`,
      timestamp: i,
    }));
    useAdvisorStore.setState({ messages: priorHistory, streaming: false, streamingContent: '' });
    invokeMock.mockResolvedValue({ data: null, error: null });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'new msg');
    });

    const { conversationHistory } = invokeMock.mock.calls[0][1].body;
    expect(conversationHistory).toHaveLength(19);
    // Oldest surviving message is msg 7 (0-indexed), not msg 0
    expect(conversationHistory[0].content).toBe('msg 7');
  });
});

describe('sendMessage — response parsing', () => {
  it('assembles text from SSE text_delta events', async () => {
    const sseData = [
      'data: {"type":"text_delta","text":"Your "}',
      'data: {"type":"text_delta","text":"FIRE "}',
      'data: {"type":"text_delta","text":"number is ₹2Cr"}',
    ].join('\n');
    invokeMock.mockResolvedValue({ data: sseData, error: null });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'FIRE?');
    });

    const assistant = useAdvisorStore.getState().messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toBe('Your FIRE number is ₹2Cr');
  });

  it('ignores SSE events that are not text_delta', async () => {
    const sseData = [
      'data: {"type":"tool_use","name":"get_fire_progress"}',
      'data: {"type":"tool_result","content":"data"}',
      'data: {"type":"text_delta","text":"Here you go"}',
    ].join('\n');
    invokeMock.mockResolvedValue({ data: sseData, error: null });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'Hi');
    });

    const assistant = useAdvisorStore.getState().messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toBe('Here you go');
  });

  it('skips malformed SSE lines without crashing', async () => {
    const sseData = [
      'data: not valid json{{{',
      'data: {"type":"text_delta","text":"valid"}',
    ].join('\n');
    invokeMock.mockResolvedValue({ data: sseData, error: null });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'Hi');
    });

    const assistant = useAdvisorStore.getState().messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toBe('valid');
  });

  it('ignores lines not starting with "data: "', async () => {
    const sseData = [
      'event: message',
      ': keep-alive',
      'data: {"type":"text_delta","text":"hello"}',
    ].join('\n');
    invokeMock.mockResolvedValue({ data: sseData, error: null });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'Hi');
    });

    const assistant = useAdvisorStore.getState().messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toBe('hello');
  });

  it('parses SSE text_delta events from a Response object', async () => {
    const sseBody = 'data: {"type":"text_delta","text":"Direct answer"}\n\n';
    const response = new Response(sseBody, { headers: { 'Content-Type': 'text/event-stream' } });
    invokeMock.mockResolvedValue({ data: response, error: null });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'Hi');
    });

    const assistant = useAdvisorStore.getState().messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toBe('Direct answer');
  });

  it('uses fallback message when response produces empty content', async () => {
    invokeMock.mockResolvedValue({ data: null, error: null });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'Hi');
    });

    const assistant = useAdvisorStore.getState().messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toContain('encountered an issue');
  });

  it('appends error message when invoke returns supabase error', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'Function failed' } });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'Hi');
    });

    const msgs = useAdvisorStore.getState().messages;
    const assistant = msgs.find((m) => m.role === 'assistant');
    expect(assistant?.content).toContain('ran into an issue');
  });

  it('appends error message when invoke rejects', async () => {
    invokeMock.mockRejectedValue(new Error('Connection refused'));

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'Hi');
    });

    const assistant = useAdvisorStore.getState().messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toContain('ran into an issue');
  });

  it('assistant message has role "assistant"', async () => {
    invokeMock.mockResolvedValue({ data: { content: 'reply' }, error: null });

    await act(async () => {
      await useAdvisorStore.getState().sendMessage('user-1', 'Hi');
    });

    const assistant = useAdvisorStore.getState().messages.find((m) => m.role === 'assistant');
    expect(assistant).toBeDefined();
  });
});

// ── clearConversation ─────────────────────────────────────────────────────────

describe('clearConversation', () => {
  it('empties the messages array', () => {
    useAdvisorStore.setState({
      messages: [
        { id: '1', role: 'user', content: 'hi', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'hello', timestamp: 2 },
      ],
      streaming: false,
      streamingContent: '',
    });

    useAdvisorStore.getState().clearConversation();

    expect(useAdvisorStore.getState().messages).toHaveLength(0);
  });

  it('clears streamingContent', () => {
    useAdvisorStore.setState({
      messages: [],
      streaming: false,
      streamingContent: 'partial response...',
    });

    useAdvisorStore.getState().clearConversation();

    expect(useAdvisorStore.getState().streamingContent).toBe('');
  });

  it('is a no-op when conversation is already empty', () => {
    expect(() => {
      useAdvisorStore.getState().clearConversation();
    }).not.toThrow();

    expect(useAdvisorStore.getState().messages).toHaveLength(0);
  });
});
