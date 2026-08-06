import { describe, it, expect } from 'vitest';
import { escapeHtml, safeUrl, clampStr, localDateStr, priorityEmoji } from '../src/util/dom.js';

describe('escapeHtml', () => {
  it('neutralizes tag and attribute delimiters', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
    expect(escapeHtml(`" onerror="x`)).toBe('&quot; onerror=&quot;x');
    expect(escapeHtml("' onload='y")).toBe('&#39; onload=&#39;y');
  });

  it('escapes ampersands first so entities are not double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('renders null and undefined as empty', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('stringifies non-strings', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('safeUrl', () => {
  it('accepts absolute http, https and mailto', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeUrl('http://example.com/')).toBe('http://example.com/');
    expect(safeUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
  });

  it('rejects script-bearing schemes', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('#');
    expect(safeUrl('JavaScript:alert(1)')).toBe('#');
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBe('#');
    expect(safeUrl('vbscript:msgbox')).toBe('#');
  });

  it('rejects relative input instead of resolving it against the app origin', () => {
    // Resolving would turn a typo'd attachment into a link back into the app,
    // which looks like it worked but goes nowhere useful.
    expect(safeUrl('drive.google.com/file/d/123')).toBe('#');
    expect(safeUrl('/etc/passwd')).toBe('#');
    expect(safeUrl('../secret')).toBe('#');
  });

  it('rejects empty and nullish input', () => {
    expect(safeUrl('')).toBe('#');
    expect(safeUrl(null)).toBe('#');
    expect(safeUrl(undefined)).toBe('#');
  });
});

describe('clampStr', () => {
  it('truncates to the limit', () => {
    expect(clampStr('abcdef', 3)).toBe('abc');
    expect(clampStr('ab', 5)).toBe('ab');
  });
  it('renders nullish as empty', () => {
    expect(clampStr(null, 5)).toBe('');
    expect(clampStr(undefined, 5)).toBe('');
  });
  it('preserves a literal zero', () => {
    expect(clampStr(0, 5)).toBe('0');
  });
});

describe('localDateStr', () => {
  it('uses local calendar fields, not the UTC date', () => {
    // A UTC-based conversion shifts the date for anyone east or west of GMT
    // near midnight, putting tasks on the wrong calendar day.
    const d = new Date(2026, 0, 5, 23, 30);
    expect(localDateStr(d)).toBe('2026-01-05');
  });

  it('zero-pads month and day', () => {
    expect(localDateStr(new Date(2026, 8, 3))).toBe('2026-09-03');
  });
});

describe('priorityEmoji', () => {
  it('gives each priority a distinct glyph so colour is not the only cue', () => {
    expect(priorityEmoji('High')).toBe('🔴');
    expect(priorityEmoji('Medium')).toBe('🟡');
    expect(priorityEmoji('Low')).toBe('🟢');
    expect(priorityEmoji('nonsense')).toBe('🟡');
  });
});
