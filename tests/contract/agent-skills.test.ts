import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface SkillIndex {
  $schema: string;
  skills: Array<{
    name: string;
    type: string;
    description: string;
    url: string;
    digest: string;
  }>;
}

const publicDir = resolve(process.cwd(), 'public');
const index = JSON.parse(
  readFileSync(resolve(publicDir, '.well-known/agent-skills/index.json'), 'utf8'),
) as SkillIndex;

describe('Agent Skills discovery', () => {
  it('publishes the current discovery schema and verifiable skill files', () => {
    expect(index.$schema).toBe('https://schemas.agentskills.io/discovery/0.2.0/schema.json');
    expect(index.skills.length).toBeGreaterThan(0);

    for (const skill of index.skills) {
      expect(skill.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(skill.type).toBe('skill-md');
      expect(skill.url).toBe(`/.well-known/agent-skills/${skill.name}/SKILL.md`);

      const bytes = readFileSync(resolve(publicDir, skill.url.slice(1)));
      const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
      expect(skill.digest).toBe(digest);

      const markdown = bytes.toString('utf8');
      expect(markdown).toContain(`name: ${skill.name}`);
      expect(markdown).toContain(`description: ${skill.description}`);
    }
  });
});

