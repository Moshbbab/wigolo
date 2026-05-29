import { describe, it, expect } from 'vitest';
import { classifyWidth } from '../../../../../src/cli/tui/shell/width.js';

describe('width', () => {
  it('classifies wide for ≥90', () => expect(classifyWidth(120)).toBe('wide'));
  it('classifies narrow for 60–89', () => expect(classifyWidth(80)).toBe('narrow'));
  it('classifies tiny for <60', () => expect(classifyWidth(50)).toBe('tiny'));
});
