import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  contentReleaseId,
  markerSource,
  resolveWebReleaseId,
  writeReleaseMarker,
} from './generate-release-marker.mjs';

const temporaryDirectories = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-um14-3-'));
  temporaryDirectories.push(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'page.tsx'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(root, 'public', 'sw.js'), 'importScripts("/sw-release.js");\n');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture"}\n');
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('UM14.3 web release marker', () => {
  it('prefers a bounded non-secret release SHA when supplied', () => {
    const root = fixture();
    const sha = 'A'.repeat(40);
    assert.equal(
      resolveWebReleaseId({ env: { RELEASE_SHA: sha }, webRoot: root }),
      `git:${sha.toLowerCase()}`,
    );
  });

  it('falls back to a deterministic content fingerprint and changes with web content', () => {
    const root = fixture();
    const first = contentReleaseId(root);
    const second = contentReleaseId(root);
    assert.equal(first, second);
    assert.match(first, /^content:[0-9a-f]{64}$/);

    fs.writeFileSync(path.join(root, 'src', 'page.tsx'), 'export const value = 2;\n');
    assert.notEqual(contentReleaseId(root), first);
  });

  it('excludes the generated marker from its own content fingerprint', () => {
    const root = fixture();
    const first = contentReleaseId(root);
    fs.writeFileSync(path.join(root, 'public', 'sw-release.js'), 'old generated value');
    assert.equal(contentReleaseId(root), first);
  });

  it('writes only bounded release identity and never copies unrelated environment values', () => {
    const root = fixture();
    const sha = 'b'.repeat(40);
    const result = writeReleaseMarker({
      webRoot: root,
      env: { RELEASE_SHA: sha, DATABASE_URL: 'postgresql://secret@example/db' },
    });
    const source = fs.readFileSync(result.output, 'utf8');
    assert.equal(result.releaseId, `git:${sha}`);
    assert.equal(source, markerSource(`git:${sha}`));
    assert.equal(source.includes('postgresql://'), false);
    assert.equal(source.includes('DATABASE_URL'), false);
  });
});
