import React from 'react';
import { render } from '@testing-library/react-native';
import { SliderInput } from '@/components/ui/inputs/SliderInput';

const baseProps = {
  label: 'Expected Return',
  value: 12,
  min: 6,
  max: 20,
  step: 0.5,
  unit: '%',
  onValueChange: jest.fn(),
};

describe('SliderInput', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing', () => {
    const { toJSON } = render(<SliderInput {...baseProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays the label', () => {
    const { getByText } = render(<SliderInput {...baseProps} />);
    expect(getByText('Expected Return')).toBeTruthy();
  });

  it('displays the current value with unit', () => {
    const { getByText } = render(<SliderInput {...baseProps} />);
    expect(getByText('12%')).toBeTruthy();
  });

  it('displays min label with unit', () => {
    const { getByText } = render(<SliderInput {...baseProps} />);
    expect(getByText('6%')).toBeTruthy();
  });

  it('displays max label with unit', () => {
    const { getByText } = render(<SliderInput {...baseProps} />);
    expect(getByText('20%')).toBeTruthy();
  });

  it('uses formatValue prop when provided', () => {
    const formatValue = (v: number) => `${v} years`;
    const { getByText } = render(
      <SliderInput {...baseProps} value={85} min={70} max={100} unit="" formatValue={formatValue} />
    );
    expect(getByText('85 years')).toBeTruthy();
    expect(getByText('70 years')).toBeTruthy();
    expect(getByText('100 years')).toBeTruthy();
  });

  it('renders at min value without crashing', () => {
    // value badge and min label both show "6%" when value === min
    const { getAllByText } = render(<SliderInput {...baseProps} value={6} />);
    expect(getAllByText('6%').length).toBeGreaterThanOrEqual(1);
  });

  it('renders at max value without crashing', () => {
    const { getByText } = render(<SliderInput {...baseProps} value={20} />);
    // value badge and max label both say "20%" — check at least one exists
    const elements = render(<SliderInput {...baseProps} value={20} />).getAllByText('20%');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders with lifespan years format', () => {
    const { getByText } = render(
      <SliderInput label="Lifespan" value={85} min={70} max={100} step={1} unit=" yrs" onValueChange={jest.fn()} />
    );
    expect(getByText('85 yrs')).toBeTruthy();
  });

  it('renders with INR savings format', () => {
    const formatValue = (v: number) => `₹${(v / 1000).toFixed(0)}K`;
    const { getByText } = render(
      <SliderInput
        label="Monthly Savings"
        value={50000}
        min={5000}
        max={200000}
        step={5000}
        onValueChange={jest.fn()}
        formatValue={formatValue}
      />
    );
    expect(getByText('₹50K')).toBeTruthy();
  });
});
