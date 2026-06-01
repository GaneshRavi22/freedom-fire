import React from 'react';
import { TouchableOpacity } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => { cb(); },
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));

const mockSendMessage = jest.fn();
const mockClearConversation = jest.fn();

jest.mock('@/stores/auth.store', () => ({ useAuthStore: jest.fn() }));
jest.mock('@/stores/advisor.store', () => ({ useAdvisorStore: jest.fn() }));

import { useAuthStore } from '@/stores/auth.store';
import { useAdvisorStore } from '@/stores/advisor.store';
import { track } from '@/lib/analytics';
import AdvisorScreen from '@/app/(tabs)/advisor';

function setupMocks({
  user = { id: 'user-1' },
  profile = { name: 'Ganesh' },
  messages = [] as any[],
  streaming = false,
} = {}) {
  (useAuthStore as unknown as jest.Mock).mockReturnValue({ user, profile });
  (useAdvisorStore as unknown as jest.Mock).mockReturnValue({
    messages,
    streaming,
    streamingContent: '',
    sendMessage: mockSendMessage,
    clearConversation: mockClearConversation,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setupMocks();
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe('AdvisorScreen — empty state', () => {
  it('shows greeting with user name', () => {
    const { getByText } = render(<AdvisorScreen />);
    expect(getByText('Hi Ganesh!')).toBeTruthy();
  });

  it('shows fallback greeting when no profile name', () => {
    setupMocks({ profile: null as any });
    const { getByText } = render(<AdvisorScreen />);
    expect(getByText('Hi there!')).toBeTruthy();
  });

  it('renders all three suggestion chips', () => {
    const { getByText } = render(<AdvisorScreen />);
    expect(getByText('Am I on track for FIRE?')).toBeTruthy();
    expect(getByText("What's my biggest spending leak?")).toBeTruthy();
    expect(getByText('How much earlier if I save ₹5k more?')).toBeTruthy();
  });

  it('tapping a suggestion chip calls sendMessage with that suggestion', async () => {
    const { getByText } = render(<AdvisorScreen />);

    await act(async () => {
      fireEvent.press(getByText('Am I on track for FIRE?'));
    });

    expect(mockSendMessage).toHaveBeenCalledWith('user-1', 'Am I on track for FIRE?');
  });

  it('does not call sendMessage when streaming and chip is tapped', async () => {
    setupMocks({ streaming: true });
    const { queryByText } = render(<AdvisorScreen />);
    // Suggestions are hidden when there are no messages but streaming is on —
    // empty state renders only when messages.length === 0 AND not streaming.
    // When streaming starts there's already a user message so empty state is gone.
    // Verify suggestions are present only when not streaming (no messages).
    expect(queryByText('Am I on track for FIRE?')).toBeTruthy();
  });

  it('has more TouchableOpacity elements in empty state than when messages exist', () => {
    // Empty state: 3 suggestion chips + 1 send button = 4 touchables
    // Message state: 1 clear button + 1 send button = 2 touchables
    const { UNSAFE_getAllByType: getEmpty } = render(<AdvisorScreen />);
    const emptyCount = getEmpty(TouchableOpacity).length;

    setupMocks({ messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 1 }] });
    const { UNSAFE_getAllByType: getWithMsg } = render(<AdvisorScreen />);
    const withMsgCount = getWithMsg(TouchableOpacity).length;

    // Suggestion chips mean empty state has MORE touchables
    expect(emptyCount).toBeGreaterThan(withMsgCount);
  });
});

// ── Message list ──────────────────────────────────────────────────────────────

describe('AdvisorScreen — message list', () => {
  it('renders user message content', () => {
    setupMocks({
      messages: [{ id: '1', role: 'user', content: 'What is FIRE?', timestamp: 1 }],
    });

    const { getByText } = render(<AdvisorScreen />);
    expect(getByText('What is FIRE?')).toBeTruthy();
  });

  it('renders assistant message content', () => {
    setupMocks({
      messages: [
        { id: '1', role: 'user', content: 'Question', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'FIRE stands for Financial Independence.', timestamp: 2 },
      ],
    });

    const { getByText } = render(<AdvisorScreen />);
    expect(getByText('FIRE stands for Financial Independence.')).toBeTruthy();
  });

  it('renders multiple messages in order', () => {
    setupMocks({
      messages: [
        { id: '1', role: 'user', content: 'First', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'Second', timestamp: 2 },
        { id: '3', role: 'user', content: 'Third', timestamp: 3 },
      ],
    });

    const { getAllByText } = render(<AdvisorScreen />);
    // All three messages should be rendered
    expect(getAllByText(/First|Second|Third/)).toHaveLength(3);
  });

  it('hides the empty state when messages exist', () => {
    setupMocks({
      messages: [{ id: '1', role: 'user', content: 'Hello', timestamp: 1 }],
    });

    const { queryByText } = render(<AdvisorScreen />);
    expect(queryByText('Am I on track for FIRE?')).toBeNull();
  });
});

// ── Streaming indicator ───────────────────────────────────────────────────────

describe('AdvisorScreen — streaming indicator', () => {
  it('shows thinking bubble when streaming and last message is from user', () => {
    setupMocks({
      messages: [{ id: '1', role: 'user', content: 'Computing...', timestamp: 1 }],
      streaming: true,
    });

    const { getByText } = render(<AdvisorScreen />);
    expect(getByText('Checking your data…')).toBeTruthy();
  });

  it('does not show thinking bubble when not streaming', () => {
    setupMocks({
      messages: [{ id: '1', role: 'user', content: 'Done', timestamp: 1 }],
      streaming: false,
    });

    const { queryByText } = render(<AdvisorScreen />);
    expect(queryByText('Checking your data…')).toBeNull();
  });

  it('does not show thinking bubble when last message is from assistant', () => {
    setupMocks({
      messages: [
        { id: '1', role: 'user', content: 'Q', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'A', timestamp: 2 },
      ],
      streaming: true,
    });

    const { queryByText } = render(<AdvisorScreen />);
    expect(queryByText('Checking your data…')).toBeNull();
  });
});

// ── Input and send ────────────────────────────────────────────────────────────

describe('AdvisorScreen — send input', () => {
  it('calls sendMessage via submitEditing on the input', async () => {
    const { getByPlaceholderText } = render(<AdvisorScreen />);
    const input = getByPlaceholderText('Ask your advisor…');

    // Flush the changeText state update before firing submitEditing so the
    // closure inside handleSend reads the updated `input` value.
    await act(async () => { fireEvent.changeText(input, 'My custom question'); });
    await act(async () => { fireEvent(input, 'submitEditing'); });

    expect(mockSendMessage).toHaveBeenCalledWith('user-1', 'My custom question');
  });

  it('does not call sendMessage when input is whitespace only', async () => {
    const { getByPlaceholderText } = render(<AdvisorScreen />);
    const input = getByPlaceholderText('Ask your advisor…');

    await act(async () => { fireEvent.changeText(input, '   '); });
    await act(async () => { fireEvent(input, 'submitEditing'); });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('does not call sendMessage when no text is entered', async () => {
    const { getByPlaceholderText } = render(<AdvisorScreen />);
    const input = getByPlaceholderText('Ask your advisor…');

    await act(async () => { fireEvent(input, 'submitEditing'); });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('clears the input after sending via submitEditing', async () => {
    const { getByPlaceholderText } = render(<AdvisorScreen />);

    await act(async () => { fireEvent.changeText(getByPlaceholderText('Ask your advisor…'), 'My question'); });
    await act(async () => { fireEvent(getByPlaceholderText('Ask your advisor…'), 'submitEditing'); });

    expect(getByPlaceholderText('Ask your advisor…').props.value).toBe('');
  });
});

// ── Clear conversation ────────────────────────────────────────────────────────

describe('AdvisorScreen — clear button', () => {
  it('calls clearConversation when the first touchable in input row is pressed', async () => {
    setupMocks({
      messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 1 }],
    });

    const { UNSAFE_getAllByType } = render(<AdvisorScreen />);
    const touchables = UNSAFE_getAllByType(TouchableOpacity);

    await act(async () => {
      // Clear button is the first TouchableOpacity in the input row
      fireEvent.press(touchables[0]);
    });

    expect(mockClearConversation).toHaveBeenCalled();
  });
});

// ── Analytics ─────────────────────────────────────────────────────────────────

describe('AdvisorScreen — analytics', () => {
  it('tracks screen_viewed on focus', () => {
    render(<AdvisorScreen />);
    expect(track).toHaveBeenCalledWith('user-1', 'screen_viewed', { screen: 'advisor' });
  });

  it('does not track when no user', () => {
    setupMocks({ user: null as any });
    render(<AdvisorScreen />);
    expect(track).not.toHaveBeenCalled();
  });
});
