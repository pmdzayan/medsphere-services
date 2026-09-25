-- Task 0049 — run only after a deployment DBA creates the NOINHERIT LOGIN role
-- named aim_bi_reader with an out-of-band credential.
--
-- This script intentionally does not CREATE ROLE or set a password.

ALTER ROLE aim_bi_reader SET default_transaction_read_only = on;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM aim_bi_reader;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM aim_bi_reader;
REVOKE CREATE ON SCHEMA public FROM aim_bi_reader;

GRANT USAGE ON SCHEMA aim_analytics TO aim_bi_reader;
GRANT SELECT ON aim_analytics.daily_audit_activity TO aim_bi_reader;
