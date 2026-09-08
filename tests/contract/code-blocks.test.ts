import { describe, expect, it } from 'vitest';
import { fencedCodeBlocks } from '@/lib/domain/code-blocks';

describe('fencedCodeBlocks', () => {
  it('lifts every fence out of a chunk with its language', () => {
    const text = [
      'Install it:',
      '```bash',
      'npx @symphonyprotocollab/re0 setup',
      '```',
      'Then call it:',
      '~~~ts title=x.ts',
      'const a = 1;',
      '',
      '~~~',
      'done',
    ].join('\n');
    expect(fencedCodeBlocks(text)).toEqual([
      { lang: 'bash', code: 'npx @symphonyprotocollab/re0 setup' },
      { lang: 'ts', code: 'const a = 1;' },
    ]);
  });

  it('runs an unterminated fence to the end of the chunk and skips empty ones', () => {
    expect(fencedCodeBlocks('```\n```\ntext\n```json\n{ "a": 1 }')).toEqual([
      { lang: 'json', code: '{ "a": 1 }' },
    ]);
  });

  it('returns nothing for prose', () => {
    expect(fencedCodeBlocks('Use `inline` code only.')).toEqual([]);
  });
});
