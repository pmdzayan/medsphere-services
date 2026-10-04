import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  contentReleaseId,
  markerSource,
  resolveWebClientGeneration,
  resolveWebReleaseId,
  resolveWebUpdatePolicy,
  writeReleaseMarker,
} from './generate-release-marker.mjs';

const temporaryDirectories = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-um14-4-'));
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

describe('UM14.3 web release identity', () => {
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
});

describe('UM14.4 release severity marker', () => {
  const releaseId = `git:${'b'.repeat(40)}`;
  const clientGeneration = 7;

  it('defaults normal releases to optional/routine', () => {
    assert.equal(resolveWebClientGeneration({ env: {} }), 1);
    assert.deepEqual(resolveWebUpdatePolicy({ env: {}, releaseId, clientGeneration }), {
      id: releaseId,
      clientGeneration,
      updateMode: 'optional',
      updateReason: 'routine',
    });
  });

  it('requires explicit bounded reason for a required release', () => {
    assert.throws(
      () =>
        resolveWebUpdatePolicy({
          env: { AIM_WEB_UPDATE_MODE: 'required' },
          releaseId,
          clientGeneration,
        }),
      /explicit non-secret update reason/,
    );
    assert.deepEqual(
      resolveWebUpdatePolicy({
        env: { AIM_WEB_UPDATE_MODE: 'required', AIM_WEB_UPDATE_REASON: 'security' },
        releaseId,
        clientGeneration,
      }),
      { id: releaseId, clientGeneration, updateMode: 'required', updateReason: 'security' },
    );
  });

  it('rejects contradictory or unbounded update policy', () => {
    assert.throws(
      () =>
        resolveWebUpdatePolicy({
          env: { AIM_WEB_UPDATE_MODE: 'required', AIM_WEB_UPDATE_REASON: 'routine' },
          releaseId,
          clientGeneration,
        }),
      /routine releases cannot be marked required/,
    );
    assert.throws(
      () =>
        resolveWebUpdatePolicy({
          env: { AIM_WEB_UPDATE_MODE: 'optional', AIM_WEB_UPDATE_REASON: 'incompatible' },
          releaseId,
          clientGeneration,
        }),
      /incompatible releases cannot be deferable/,
    );
    assert.throws(
      () =>
        resolveWebUpdatePolicy({
          env: { AIM_WEB_UPDATE_MODE: 'mandatory-now', AIM_WEB_UPDATE_REASON: 'security' },
          releaseId,
          clientGeneration,
        }),
      /AIM_WEB_UPDATE_MODE/,
    );
  });

  it('validates the bounded web client generation', () => {
    assert.equal(
      resolveWebClientGeneration({ env: { AIM_WEB_CLIENT_GENERATION: '42' } }),
      42,
    );
    assert.throws(
      () => resolveWebClientGeneration({ env: { AIM_WEB_CLIENT_GENERATION: '0' } }),
      /supported range/,
    );
    assert.throws(
      () => resolveWebClientGeneration({ env: { AIM_WEB_CLIENT_GENERATION: 'latest' } }),
      /bounded positive integer/,
    );
  });

  it('writes only bounded release policy and never copies unrelated environment values', () => {
    const root = fixture();
    const sha = 'c'.repeat(40);
    const result = writeReleaseMarker({
      webRoot: root,
      env: {
        RELEASE_SHA: sha,
        AIM_WEB_UPDATE_MODE: 'required',
        AIM_WEB_UPDATE_REASON: 'security',
        AIM_WEB_CLIENT_GENERATION: '9',
        DATABASE_URL: 'postgresql://secret@example/db',
        PATIENT_NAME: 'not-for-client',
      },
    });
    const source = fs.readFileSync(result.output, 'utf8');
    assert.equal(result.releaseId, `git:${sha}`);
    assert.equal(result.releasePolicy.clientGeneration, 9);
    assert.equal(source, markerSource(result.releasePolicy));
    assert.equal(source.includes('postgresql://'), false);
    assert.equal(source.includes('DATABASE_URL'), false);
    assert.equal(source.includes('PATIENT_NAME'), false);
    assert.equal(source.includes('not-for-client'), false);
  });

  it('changes service-worker marker bytes when release severity changes', () => {
    const optional = markerSource({
      id: releaseId,
      clientGeneration,
      updateMode: 'optional',
      updateReason: 'routine',
    });
    const required = markerSource({
      id: releaseId,
      clientGeneration,
      updateMode: 'required',
      updateReason: 'security',
    });
    assert.notEqual(optional, required);
  });
});
