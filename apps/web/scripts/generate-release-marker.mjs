#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WEB_ROOT = path.resolve(SCRIPT_DIR, '..');
const GENERATED_MARKER = path.join('public', 'sw-release.js');
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const UPDATE_MODES = new Set(['optional', 'required']);
const UPDATE_REASONS = new Set(['routine', 'security', 'incompatible']);
const CLIENT_GENERATION_PATTERN = /^\d{1,10}$/;
const CLIENT_GENERATION_MAX = 1_000_000_000;

function walk(directory, root, files) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    if (entry.isDirectory() && ['.next', 'coverage', 'node_modules'].includes(entry.name)) {
      continue;
    }
    if (entry.isDirectory()) {
      walk(absolute, root, files);
      continue;
    }
    if (relative === GENERATED_MARKER) continue;
    files.push(relative);
  }
}

export function contentReleaseId(webRoot = DEFAULT_WEB_ROOT) {
  const files = [];
  for (const relative of ['src', 'public']) {
    walk(path.join(webRoot, relative), webRoot, files);
  }
  for (const relative of [
    'package.json',
    'next.config.ts',
    'tailwind.config.ts',
    'postcss.config.js',
  ]) {
    if (fs.existsSync(path.join(webRoot, relative))) files.push(relative);
  }

  files.sort();
  const hash = crypto.createHash('sha256');
  for (const relative of files) {
    hash.update(relative);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(webRoot, relative)));
    hash.update('\0');
  }
  return `content:${hash.digest('hex')}`;
}

export function resolveWebReleaseId({ env = process.env, webRoot = DEFAULT_WEB_ROOT } = {}) {
  for (const key of ['RELEASE_SHA', 'GITHUB_SHA']) {
    const value = String(env[key] ?? '').trim();
    if (RELEASE_SHA_PATTERN.test(value)) return `git:${value.toLowerCase()}`;
  }
  return contentReleaseId(webRoot);
}

export function resolveWebClientGeneration({ env = process.env } = {}) {
  const raw = String(env.AIM_WEB_CLIENT_GENERATION ?? '1').trim();
  if (!CLIENT_GENERATION_PATTERN.test(raw)) {
    throw new Error('UM14.5 AIM_WEB_CLIENT_GENERATION must be a bounded positive integer');
  }

  const clientGeneration = Number(raw);
  if (
    !Number.isSafeInteger(clientGeneration) ||
    clientGeneration < 1 ||
    clientGeneration > CLIENT_GENERATION_MAX
  ) {
    throw new Error('UM14.5 AIM_WEB_CLIENT_GENERATION is outside the supported range');
  }

  return clientGeneration;
}

export function resolveWebUpdatePolicy({
  env = process.env,
  releaseId,
  clientGeneration = resolveWebClientGeneration({ env }),
}) {
  const modeValue = env.AIM_WEB_UPDATE_MODE ?? 'optional';
  const reasonValue = env.AIM_WEB_UPDATE_REASON ?? '';
  const updateMode = String(modeValue).trim().toLowerCase();
  const rawReason = String(reasonValue).trim().toLowerCase();
  const updateReason = rawReason || 'routine';

  if (!UPDATE_MODES.has(updateMode)) {
    throw new Error('UM14.4 AIM_WEB_UPDATE_MODE must be optional or required');
  }
  if (!UPDATE_REASONS.has(updateReason)) {
    throw new Error('UM14.4 AIM_WEB_UPDATE_REASON must be routine, security, or incompatible');
  }
  if (updateMode === 'required' && rawReason.length === 0) {
    throw new Error('UM14.4 required updates need an explicit non-secret update reason');
  }
  if (updateMode === 'required' && updateReason === 'routine') {
    throw new Error('UM14.4 routine releases cannot be marked required');
  }
  if (updateMode === 'optional' && updateReason === 'incompatible') {
    throw new Error('UM14.4 incompatible releases cannot be deferable');
  }

  return Object.freeze({ id: releaseId, clientGeneration, updateMode, updateReason });
}

export function markerSource(releasePolicy) {
  if (!releasePolicy || typeof releasePolicy !== 'object') {
    throw new Error('UM14.4 web release policy is required');
  }

  const normalizedPolicy = {
    ...releasePolicy,
    clientGeneration: releasePolicy.clientGeneration ?? 1,
  };
  const validId = /^(git:[0-9a-f]{40}|content:[0-9a-f]{64})$/.test(normalizedPolicy.id);
  const validGeneration =
    Number.isSafeInteger(normalizedPolicy.clientGeneration) &&
    normalizedPolicy.clientGeneration >= 1 &&
    normalizedPolicy.clientGeneration <= CLIENT_GENERATION_MAX;
  const validMode = UPDATE_MODES.has(normalizedPolicy.updateMode);
  const validReason = UPDATE_REASONS.has(normalizedPolicy.updateReason);

  if (!validId) {
    throw new Error('UM14.3 web release identity is invalid');
  }
  if (!validGeneration) {
    throw new Error('UM14.5 web client generation is invalid');
  }
  if (!validMode || !validReason) {
    throw new Error('UM14.4 web release policy is invalid');
  }
  if (normalizedPolicy.updateMode === 'required' && normalizedPolicy.updateReason === 'routine') {
    throw new Error('UM14.4 routine releases cannot be marked required');
  }
  if (
    normalizedPolicy.updateMode === 'optional' &&
    normalizedPolicy.updateReason === 'incompatible'
  ) {
    throw new Error('UM14.4 incompatible releases cannot be deferable');
  }

  const serialized = JSON.stringify(normalizedPolicy);
  return `/* Generated by AIM UM14.5. Non-secret release identity, client generation and update policy only. */\nself.__AIM_WEB_RELEASE__ = Object.freeze(${serialized});\nif (typeof document !== 'undefined') {\n  var aimClientCookie = 'aim_web_client_generation=' + encodeURIComponent(String(self.__AIM_WEB_RELEASE__.clientGeneration)) + '; Path=/; SameSite=Strict';\n  if (self.location && self.location.protocol === 'https:') aimClientCookie += '; Secure';\n  document.cookie = aimClientCookie;\n}\n`;
}

export function writeReleaseMarker({ webRoot = DEFAULT_WEB_ROOT, env = process.env } = {}) {
  const releaseId = resolveWebReleaseId({ env, webRoot });
  const clientGeneration = resolveWebClientGeneration({ env });
  const releasePolicy = resolveWebUpdatePolicy({ env, releaseId, clientGeneration });
  const output = path.join(webRoot, GENERATED_MARKER);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, markerSource(releasePolicy), 'utf8');
  return { releaseId, releasePolicy, output };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = writeReleaseMarker();
  const mode = result.releasePolicy.updateMode;
  const reason = result.releasePolicy.updateReason;
  process.stdout.write(`AIM web release marker: ${result.releaseId} (${mode}/${reason})\n`);
}
