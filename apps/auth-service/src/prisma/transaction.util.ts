// Compatibility export while transaction ownership moves to the shared
// database boundary. New modules import directly from @medsphere/database.
export { hasPrismaCode, withSerializableRetry } from '@medsphere/database';
