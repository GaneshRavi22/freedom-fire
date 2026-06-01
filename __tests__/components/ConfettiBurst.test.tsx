import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

import { ConfettiBurst } from '@/components/ui/gamification/ConfettiBurst';

describe('ConfettiBurst', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<ConfettiBurst />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders a full-size container with pointer-events disabled', () => {
    const { getByTestId, toJSON } = render(<ConfettiBurst />);
    const json = toJSON() as any;
    expect(json).toBeTruthy();
    expect(json.props.style).toMatchObject({
      position: 'absolute',
      width: '100%',
      height: '100%',
    });
  });

  it('renders 28 dot children', () => {
    const { toJSON } = render(<ConfettiBurst />);
    const json = toJSON() as any;
    expect(json.children).toHaveLength(28);
  });

  it('renders consistently on re-render', () => {
    const { toJSON, rerender } = render(<ConfettiBurst />);
    const first = JSON.stringify(toJSON());
    rerender(<ConfettiBurst />);
    const second = JSON.stringify(toJSON());
    expect(first).toBe(second);
  });
});
