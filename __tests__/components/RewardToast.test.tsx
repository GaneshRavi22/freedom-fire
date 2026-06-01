import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import { RewardToast } from '@/components/ui/gamification/RewardToast';

describe('RewardToast — hidden', () => {
  it('returns null when visible=false', () => {
    const { toJSON } = render(
      <RewardToast visible={false} xpEarned={50} message="Task done!" onHide={jest.fn()} />
    );
    expect(toJSON()).toBeNull();
  });
});

describe('RewardToast — visible', () => {
  it('renders without crashing when visible=true', () => {
    const { toJSON } = render(
      <RewardToast visible={true} xpEarned={50} message="Task done!" onHide={jest.fn()} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('shows the message text', () => {
    const { getByText } = render(
      <RewardToast visible={true} xpEarned={50} message="Task done!" onHide={jest.fn()} />
    );
    expect(getByText('Task done!')).toBeTruthy();
  });

  it('shows XP earned when xpEarned > 0', () => {
    const { getByText } = render(
      <RewardToast visible={true} xpEarned={75} message="Done" onHide={jest.fn()} />
    );
    expect(getByText('+75 XP')).toBeTruthy();
  });

  it('shows freedom days when freedomDaysEarned > 0', () => {
    const { getByText } = render(
      <RewardToast
        visible={true}
        xpEarned={50}
        freedomDaysEarned={3}
        message="Done"
        onHide={jest.fn()}
      />
    );
    expect(getByText('+3 Freedom Days')).toBeTruthy();
  });

  it('does not show freedom days when freedomDaysEarned is 0', () => {
    const { queryByText } = render(
      <RewardToast
        visible={true}
        xpEarned={50}
        freedomDaysEarned={0}
        message="Done"
        onHide={jest.fn()}
      />
    );
    expect(queryByText(/Freedom Days/)).toBeNull();
  });

  it('does not show freedom days when freedomDaysEarned is not provided', () => {
    const { queryByText } = render(
      <RewardToast visible={true} xpEarned={50} message="Done" onHide={jest.fn()} />
    );
    expect(queryByText(/Freedom Days/)).toBeNull();
  });
});
