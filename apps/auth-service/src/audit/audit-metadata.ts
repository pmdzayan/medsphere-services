import { AUDIT_METADATA_KEYS, isAuditEventType } from './audit.constants';
import { AuditMetadata, AuditMetadataValue } from './audit.types';

const APPLICATION_METADATA_LIMIT_BYTES = 12 * 1024;
const FORBIDDEN_METADATA_KEY =
  /(password|credential|token|secret|authorization|email|phone|medical|clinical|payload|snapshot|oldvalue|newvalue)/i;

export function validateAuditMetadata(eventType: string, metadata: unknown): AuditMetadata {
  if (!isAuditEventType(eventType)) {
    throw new Error('Unsupported audit event type');
  }
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    Array.isArray(metadata) ||
    Object.getPrototypeOf(metadata) !== Object.prototype
  ) {
    throw new Error('Audit metadata must be a plain object');
  }

  const allowedKeys = new Set<string>(AUDIT_METADATA_KEYS[eventType]);
  for (const [key, value] of Object.entries(metadata)) {
    if (!allowedKeys.has(key) || FORBIDDEN_METADATA_KEY.test(key)) {
      throw new Error('Audit metadata contains an unsupported key');
    }
    validateMetadataValue(value);
  }

  if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > APPLICATION_METADATA_LIMIT_BYTES) {
    throw new Error('Audit metadata exceeds the application size limit');
  }
  return metadata as AuditMetadata;
}

function validateMetadataValue(value: unknown): asserts value is AuditMetadataValue {
  if (value === null || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return;
  }
  if (typeof value === 'string' && value.length <= 240) {
    return;
  }
  throw new Error('Audit metadata values must be bounded scalars');
}
