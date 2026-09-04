// Task 0020 common cross-vertical security framework.
// Canonical shared contracts for trusted identity, tenant isolation, provider
// scope, exact-user audit, and sensitive-value guards. Future vertical modules
// import from here instead of inventing their own security conventions.
export * from './trusted-actor';
export * from './tenant-scope';
export * from './provider-access';
export * from './audit';
export * from './sensitive-values';
