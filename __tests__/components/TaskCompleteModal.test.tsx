import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import { TaskCompleteModal } from '@/components/ui/modals/TaskCompleteModal';

describe('TaskCompleteModal — visible', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <TaskCompleteModal visible={true} taskTitle="Reduce delivery spend" xpEarned={75} onClose={jest.fn()} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('shows TASK COMPLETE! label', () => {
    const { getByText } = render(
      <TaskCompleteModal visible={true} taskTitle="Reduce delivery spend" xpEarned={75} onClose={jest.fn()} />
    );
    expect(getByText('TASK COMPLETE!')).toBeTruthy();
  });

  it('shows the task title', () => {
    const { getByText } = render(
      <TaskCompleteModal visible={true} taskTitle="Reduce delivery spend" xpEarned={75} onClose={jest.fn()} />
    );
    expect(getByText('Reduce delivery spend')).toBeTruthy();
  });

  it('shows XP earned', () => {
    const { getByText } = render(
      <TaskCompleteModal visible={true} taskTitle="Some task" xpEarned={100} onClose={jest.fn()} />
    );
    expect(getByText('+100 XP earned')).toBeTruthy();
  });

  it('shows motivational text', () => {
    const { getByText } = render(
      <TaskCompleteModal visible={true} taskTitle="Some task" xpEarned={50} onClose={jest.fn()} />
    );
    expect(getByText(/financial freedom/)).toBeTruthy();
  });

  it('calls onClose when Keep Going! is pressed', () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <TaskCompleteModal visible={true} taskTitle="Some task" xpEarned={50} onClose={onClose} />
    );
    fireEvent.press(getByText('Keep Going!'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('TaskCompleteModal — not visible', () => {
  it('renders null when visible=false', () => {
    const { toJSON } = render(
      <TaskCompleteModal visible={false} taskTitle="Some task" xpEarned={50} onClose={jest.fn()} />
    );
    expect(toJSON()).toBeNull();
  });
});
