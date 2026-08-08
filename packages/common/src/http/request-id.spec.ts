import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRequestId } from './request-id';

test('normalizeRequestId accepts a valid UUID request ID', () => {
  const uuid = '123e4567-e89b-12d3-a456-426614174000';
  assert.equal(normalizeRequestId(uuid), uuid);
});

test('normalizeRequestId accepts a safe bounded opaque request ID', () => {
  const opaque = 'gateway:request-123_op.1';
  assert.equal(normalizeRequestId(opaque), opaque);
});

test('normalizeRequestId rejects whitespace and internal spaces', () => {
  assert.equal(normalizeRequestId(' contains whitespace '), undefined);
  assert.equal(normalizeRequestId('internal space'), undefined);
});

test('normalizeRequestId rejects tabs and control characters', () => {
  assert.equal(normalizeRequestId('req\thd'), undefined);
  assert.equal(normalizeRequestId('req\nhd'), undefined);
});

test('normalizeRequestId rejects values exceeding approved maximum length', () => {
  assert.equal(normalizeRequestId('x'.repeat(121)), undefined);
});

test('normalizeRequestId rejects email-like values containing @', () => {
  assert.equal(normalizeRequestId('patient@example.test'), undefined);
});

test('normalizeRequestId rejects empty strings', () => {
  assert.equal(normalizeRequestId(''), undefined);
});

test('normalizeRequestId rejects header arrays, objects, numbers, and undefined', () => {
  assert.equal(normalizeRequestId(['req-1', 'req-2']), undefined);
  assert.equal(normalizeRequestId({ id: '123' }), undefined);
  assert.equal(normalizeRequestId(12345), undefined);
  assert.equal(normalizeRequestId(undefined), undefined);
});
