import { describe, expect, it } from 'vitest';
import {
  CALLOUT_KINDS,
  CALLOUTS,
  RICH_TEXT_CALLOUT_CSS,
  calloutClasses,
  calloutKindOf,
} from './rich-text-callouts.js';

describe('rich-text callouts', () => {
  it('describes every kind exactly once', () => {
    expect(CALLOUTS.map((callout) => callout.kind)).toEqual([...CALLOUT_KINDS]);
  });

  it('styles and labels every kind', () => {
    for (const { kind, label } of CALLOUTS) {
      expect(RICH_TEXT_CALLOUT_CSS).toContain(`.callout-${kind} { --callout-color:`);
      expect(RICH_TEXT_CALLOUT_CSS).toContain(label.replace(/"/g, '\\"'));
    }
  });

  it('reads the kind back from its classes, whatever their order', () => {
    expect(calloutKindOf(calloutClasses('tip'))).toBe('tip');
    expect(calloutKindOf('callout-dont callout')).toBe('dont');
  });

  it('names no kind for unknown or incomplete classes', () => {
    expect(calloutKindOf('callout callout-party')).toBeNull();
    expect(calloutKindOf('callout-tip')).toBeNull();
    expect(calloutKindOf(undefined)).toBeNull();
  });
});
