import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// src/shared exists in both apps so each deploys on its own. They must stay identical,
// or the server and the customer page disagree on schemas and legal wording.
const server = new URL('../shared/', import.meta.url);
const frontend = new URL('../../../frontend/src/shared/', import.meta.url);

describe.skipIf(!existsSync(frontend))('shared code', () => {
  it.each(['index.ts', 'legal.ts'])('%s is identical in server/ and frontend/', (file) => {
    expect(readFileSync(new URL(file, frontend), 'utf8')).toBe(
      readFileSync(new URL(file, server), 'utf8'),
    );
  });
});
