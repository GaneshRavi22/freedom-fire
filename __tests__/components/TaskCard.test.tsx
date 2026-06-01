import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import { TaskCard } from '@/components/ui/cards/TaskCard';
import type { UserTask } from '@/lib/tasks';

function makeTask(overrides: Partial<UserTask> = {}): UserTask {
  return {
    id: 'task-1',
    user_id: 'user-1',
    task_type: 'reduce_fast_commerce',
    title: 'Cut Delivery & Quick Commerce by 30%',
    description: 'Reduce spending on delivery apps',
    metadata: {},
    status: 'recommended',
    target_completion_date: null,
    xp_reward: 75,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('TaskCard — recommended task', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<TaskCard task={makeTask()} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows the task title', () => {
    const { getByText } = render(<TaskCard task={makeTask()} />);
    expect(getByText('Cut Delivery & Quick Commerce by 30%')).toBeTruthy();
  });

  it('shows XP reward text', () => {
    const { getByText } = render(<TaskCard task={makeTask()} />);
    expect(getByText('75 XP on completion')).toBeTruthy();
  });

  it('shows Accept and Cancel buttons for recommended task', () => {
    const { getByText } = render(<TaskCard task={makeTask()} />);
    expect(getByText('Accept')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('calls onAccept when Accept is pressed', () => {
    const onAccept = jest.fn();
    const { getByText } = render(<TaskCard task={makeTask()} onAccept={onAccept} />);
    fireEvent.press(getByText('Accept'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel is pressed', () => {
    const onCancel = jest.fn();
    const { getByText } = render(<TaskCard task={makeTask()} onCancel={onCancel} />);
    fireEvent.press(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('TaskCard — accepted task', () => {
  const acceptedTask = makeTask({ status: 'accepted', target_completion_date: '2026-08-01' });

  it('shows Mark as Done and Move Back buttons', () => {
    const { getByText } = render(<TaskCard task={acceptedTask} />);
    expect(getByText('Mark as Done')).toBeTruthy();
    expect(getByText('Move Back')).toBeTruthy();
  });

  it('shows target completion date', () => {
    const { getByText } = render(<TaskCard task={acceptedTask} />);
    expect(getByText(/Target:/)).toBeTruthy();
  });

  it('calls onComplete when Mark as Done is pressed', () => {
    const onComplete = jest.fn();
    const { getByText } = render(<TaskCard task={acceptedTask} onComplete={onComplete} />);
    fireEvent.press(getByText('Mark as Done'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Move Back is pressed', () => {
    const onCancel = jest.fn();
    const { getByText } = render(<TaskCard task={acceptedTask} onCancel={onCancel} />);
    fireEvent.press(getByText('Move Back'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not show target date when target_completion_date is null', () => {
    const { queryByText } = render(
      <TaskCard task={makeTask({ status: 'accepted', target_completion_date: null })} />
    );
    expect(queryByText(/Target:/)).toBeNull();
  });
});

describe('TaskCard — freedom days', () => {
  it('shows freedom days when freedomDays < 365', () => {
    const { getByText } = render(<TaskCard task={makeTask()} freedomDays={30} />);
    expect(getByText('+30 Freedom Days')).toBeTruthy();
  });

  it('shows singular "Freedom Day" when freedomDays = 1', () => {
    const { getByText } = render(<TaskCard task={makeTask()} freedomDays={1} />);
    expect(getByText('+1 Freedom Day')).toBeTruthy();
  });

  it('shows Freedom Years when freedomDays >= 365', () => {
    const { getByText } = render(<TaskCard task={makeTask()} freedomDays={730} />);
    expect(getByText(/Freedom Years/)).toBeTruthy();
  });

  it('hides freedom days row when freedomDays is 0', () => {
    const { queryByText } = render(<TaskCard task={makeTask()} freedomDays={0} />);
    expect(queryByText(/Freedom Day/)).toBeNull();
  });

  it('hides freedom days row when freedomDays is null', () => {
    const { queryByText } = render(<TaskCard task={makeTask()} freedomDays={null} />);
    expect(queryByText(/Freedom Day/)).toBeNull();
  });
});
