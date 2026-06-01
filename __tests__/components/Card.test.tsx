import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { Card } from '@/components/ui/cards/Card';

describe('Card', () => {
  it('renders children', () => {
    const { getByText } = render(<Card><Text>Card content</Text></Card>);
    expect(getByText('Card content')).toBeTruthy();
  });

  it('renders without elevated prop', () => {
    const { getByText } = render(<Card><Text>Normal</Text></Card>);
    expect(getByText('Normal')).toBeTruthy();
  });

  it('renders with elevated prop', () => {
    const { getByText } = render(<Card elevated><Text>Elevated</Text></Card>);
    expect(getByText('Elevated')).toBeTruthy();
  });

  it('accepts a custom style prop', () => {
    const { getByText } = render(
      <Card style={{ margin: 8 }}><Text>Styled</Text></Card>
    );
    expect(getByText('Styled')).toBeTruthy();
  });
});
