import React from 'react';
import { render } from '@testing-library/react-native';

import { FunanceLogo } from '@/components/ui/layout/FunanceLogo';

describe('FunanceLogo — default props', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<FunanceLogo />);
    expect(toJSON()).toBeTruthy();
  });

  it('does not show text by default', () => {
    const { queryByText } = render(<FunanceLogo />);
    expect(queryByText('Freedom')).toBeNull();
    expect(queryByText('Fire')).toBeNull();
  });
});

describe('FunanceLogo — showText=true', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<FunanceLogo showText />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows Freedom text', () => {
    const { getByText } = render(<FunanceLogo showText />);
    expect(getByText('Freedom')).toBeTruthy();
  });

  it('shows Fire text', () => {
    const { getByText } = render(<FunanceLogo showText />);
    expect(getByText('Fire')).toBeTruthy();
  });

  it('applies custom textSize when provided', () => {
    const { getByText } = render(<FunanceLogo showText textSize={32} />);
    expect(getByText('Freedom')).toBeTruthy();
  });
});

describe('FunanceLogo — size prop', () => {
  it('renders with a custom size', () => {
    const { toJSON } = render(<FunanceLogo size={96} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with the minimum meaningful size', () => {
    const { toJSON } = render(<FunanceLogo size={16} />);
    expect(toJSON()).toBeTruthy();
  });
});
