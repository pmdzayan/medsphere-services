-- PostgreSQL truncates identifiers longer than 63 bytes. The S0.5 migration
-- supplied a 65-character foreign-key name, so PostgreSQL persisted it with
-- an `_fk` suffix while Prisma expects its own 63-character `_fkey` name.
-- Preserve the accepted S0.5 migration and repair the physical name forward.

DO $$
DECLARE
  truncated_constraint_exists BOOLEAN;
  expected_constraint_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"MedicineReservationCommand"'::regclass
      AND contype = 'f'
      AND conname = 'MedicineReservationCommand_reservationId_tenantId_providerId_fk'
  ) INTO truncated_constraint_exists;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"MedicineReservationCommand"'::regclass
      AND contype = 'f'
      AND conname = 'MedicineReservationCommand_reservationId_tenantId_provider_fkey'
  ) INTO expected_constraint_exists;

  IF truncated_constraint_exists AND expected_constraint_exists THEN
    RAISE EXCEPTION
      'S0.5 foreign-key repair blocked: both truncated and expected constraints exist';
  ELSIF truncated_constraint_exists THEN
    ALTER TABLE "MedicineReservationCommand"
      RENAME CONSTRAINT "MedicineReservationCommand_reservationId_tenantId_providerId_fk"
      TO "MedicineReservationCommand_reservationId_tenantId_provider_fkey";
  ELSIF NOT expected_constraint_exists THEN
    RAISE EXCEPTION
      'S0.5 foreign-key repair blocked: neither truncated nor expected constraint exists';
  END IF;
END $$;
