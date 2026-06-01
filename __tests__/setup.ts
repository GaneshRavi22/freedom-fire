import 'react-native-gesture-handler/jestSetup';

// analytics is fire-and-forget; mock globally so tests don't need Supabase env vars
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));

// Silence noisy act() warnings in store tests
jest.spyOn(console, 'error').mockImplementation((msg, ...args) => {
  if (typeof msg === 'string' && msg.includes('act(')) return;
  console.warn(msg, ...args);
});
