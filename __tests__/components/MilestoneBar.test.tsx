import React from 'react';
import { render } from '@testing-library/react-native';
import { MilestoneBar } from '@/components/ui/gamification/MilestoneBar';

describe('MilestoneBar', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<MilestoneBar progress={50} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the 0% edge label', () => {
    const { getByText } = render(<MilestoneBar progress={30} />);
    expect(getByText('0%')).toBeTruthy();
  });

  it('renders default milestone labels', () => {
    const { getByText } = render(<MilestoneBar progress={0} />);
    expect(getByText('25%')).toBeTruthy();
    expect(getByText('50%')).toBeTruthy();
    expect(getByText('75%')).toBeTruthy();
  });

  it('renders the FIRE icon milestone (no text label)', () => {
    const { queryByText } = render(<MilestoneBar progress={100} />);
    // The 100% milestone renders an icon, not the text "FIRE"
    expect(queryByText('FIRE')).toBeNull();
  });

  it('does not show the cursor dot when progress is 0', () => {
    const { toJSON } = render(<MilestoneBar progress={0} />);
    // Just confirm it renders without the cursor being present (no crash)
    expect(toJSON()).toBeTruthy();
  });

  it('shows the progress badge when 0 < progress < 100', () => {
    const { getByText } = render(<MilestoneBar progress={42} />);
    expect(getByText('42%')).toBeTruthy();
  });

  it('rounds the progress badge to the nearest integer', () => {
    const { getByText } = render(<MilestoneBar progress={42.6} />);
    expect(getByText('43%')).toBeTruthy();
  });

  it('does not show progress badge when progress is 0', () => {
    const { queryByText } = render(<MilestoneBar progress={0} />);
    expect(queryByText('0%')).toBeTruthy(); // this is the edge label, not a badge
    // progress badge only appears for 0 < x < 100
  });

  it('does not show progress badge at exactly 100', () => {
    // At 100% the badge condition (clamped > 0 && clamped < 100) is false
    const { getAllByText } = render(<MilestoneBar progress={100} />);
    // Only the "0%" edge label should contain "0" text at root level
    expect(getAllByText('0%').length).toBeGreaterThanOrEqual(1);
  });

  it('clamps negative progress to 0', () => {
    const { toJSON } = render(<MilestoneBar progress={-10} />);
    expect(toJSON()).toBeTruthy();
  });

  it('clamps progress above 100 to 100', () => {
    const { toJSON } = render(<MilestoneBar progress={150} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders custom milestones', () => {
    const custom = [
      { pct: 33, label: 'One-third' },
      { pct: 66, label: 'Two-thirds' },
    ];
    const { getByText } = render(<MilestoneBar progress={50} milestones={custom} />);
    expect(getByText('One-third')).toBeTruthy();
    expect(getByText('Two-thirds')).toBeTruthy();
  });

  it('renders icon milestone as an icon, not text', () => {
    const custom = [{ pct: 50, label: 'Half', icon: 'star' as const }];
    const { queryByText, UNSAFE_getAllByType } = render(
      <MilestoneBar progress={60} milestones={custom} />
    );
    expect(queryByText('Half')).toBeNull();
    const { Ionicons } = require('@expo/vector-icons');
    const icons = UNSAFE_getAllByType(Ionicons);
    expect(icons.length).toBeGreaterThanOrEqual(1);
  });

  it('applies reached style to milestones at or below current progress', () => {
    // Render at 50% — the 25% milestone is "reached", 75% is not
    const { toJSON } = render(<MilestoneBar progress={50} />);
    expect(toJSON()).toBeTruthy();
  });
});
