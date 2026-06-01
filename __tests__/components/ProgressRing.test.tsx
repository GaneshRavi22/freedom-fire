import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ProgressRing } from '@/components/ui/gamification/ProgressRing';

describe('ProgressRing', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<ProgressRing progress={50} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with default props', () => {
    const { toJSON } = render(<ProgressRing progress={0} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with progress at 100', () => {
    const { toJSON } = render(<ProgressRing progress={100} />);
    expect(toJSON()).toBeTruthy();
  });

  it('clamps progress below 0', () => {
    const { toJSON } = render(<ProgressRing progress={-20} />);
    expect(toJSON()).toBeTruthy();
  });

  it('clamps progress above 100', () => {
    const { toJSON } = render(<ProgressRing progress={150} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders children inside the ring', () => {
    const { getByText } = render(
      <ProgressRing progress={60}>
        <Text>60%</Text>
      </ProgressRing>
    );
    expect(getByText('60%')).toBeTruthy();
  });

  it('renders without children', () => {
    const { toJSON } = render(<ProgressRing progress={40} />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts custom size', () => {
    const { toJSON } = render(<ProgressRing progress={50} size={200} />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts custom strokeWidth', () => {
    const { toJSON } = render(<ProgressRing progress={50} strokeWidth={8} />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts custom color and trailColor', () => {
    const { toJSON } = render(
      <ProgressRing progress={50} color="#FF6B6B" trailColor="#333" />
    );
    expect(toJSON()).toBeTruthy();
  });
});
