import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/ui/gamification/ConfettiBurst', () => ({ ConfettiBurst: () => null }));

import { XPCelebrationModal } from '@/components/ui/modals/XPCelebrationModal';

const baseProps = {
  visible: true,
  title: 'FIRE Calculated!',
  icon: 'calculator' as const,
  iconColor: '#6C63FF',
  xpEarned: 100,
  message: 'Your FIRE plan has been saved.',
  onClose: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe('XPCelebrationModal — visible', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<XPCelebrationModal {...baseProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows the title', () => {
    const { getByText } = render(<XPCelebrationModal {...baseProps} />);
    expect(getByText('FIRE Calculated!')).toBeTruthy();
  });

  it('shows the XP earned', () => {
    const { getByText } = render(<XPCelebrationModal {...baseProps} />);
    expect(getByText('+100 XP')).toBeTruthy();
  });

  it('shows the message', () => {
    const { getByText } = render(<XPCelebrationModal {...baseProps} />);
    expect(getByText('Your FIRE plan has been saved.')).toBeTruthy();
  });

  it('shows the Awesome! button', () => {
    const { getByText } = render(<XPCelebrationModal {...baseProps} />);
    expect(getByText('Awesome!')).toBeTruthy();
  });

  it('calls onClose when Awesome! is pressed', () => {
    const onClose = jest.fn();
    const { getByText } = render(<XPCelebrationModal {...baseProps} onClose={onClose} />);
    fireEvent.press(getByText('Awesome!'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows freedom days badge when freedomDaysEarned > 0', () => {
    const { getByText } = render(
      <XPCelebrationModal {...baseProps} freedomDaysEarned={5} />
    );
    expect(getByText('+5 Freedom Days')).toBeTruthy();
  });

  it('hides freedom days badge when freedomDaysEarned is 0', () => {
    const { queryByText } = render(
      <XPCelebrationModal {...baseProps} freedomDaysEarned={0} />
    );
    expect(queryByText(/Freedom Days/)).toBeNull();
  });

  it('hides freedom days badge when freedomDaysEarned is not provided', () => {
    const { queryByText } = render(<XPCelebrationModal {...baseProps} />);
    expect(queryByText(/Freedom Days/)).toBeNull();
  });

  it('shows singular and plural freedom days correctly', () => {
    const { getByText: get1 } = render(
      <XPCelebrationModal {...baseProps} freedomDaysEarned={1} />
    );
    expect(get1('+1 Freedom Days')).toBeTruthy();

    const { getByText: get10 } = render(
      <XPCelebrationModal {...baseProps} freedomDaysEarned={10} />
    );
    expect(get10('+10 Freedom Days')).toBeTruthy();
  });
});

describe('XPCelebrationModal — not visible', () => {
  it('renders null when visible=false', () => {
    const { toJSON } = render(<XPCelebrationModal {...baseProps} visible={false} />);
    expect(toJSON()).toBeNull();
  });

  it('does not show the title text when visible=false', () => {
    const { queryByText } = render(<XPCelebrationModal {...baseProps} visible={false} />);
    expect(queryByText('FIRE Calculated!')).toBeNull();
  });
});
