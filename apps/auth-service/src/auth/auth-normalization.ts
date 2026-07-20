/**
 * Canonicalizes public authentication locators before either validation or
 * rate-limit key generation. Guards run before DTO pipes in Nest, so sharing
 * this rule prevents whitespace or casing variants from bypassing the
 * account-level throttle while resolving to the same database identity.
 */
export function normalizeAuthenticationLocator(value: string): string {
  return value.trim().toLowerCase();
}
