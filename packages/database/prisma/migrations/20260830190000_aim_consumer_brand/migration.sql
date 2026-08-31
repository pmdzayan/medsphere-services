-- Task 0029: update the user-visible name of the reserved personal-account
-- tenant without renaming its stable slug or any technical identifier.
UPDATE "Tenant"
SET "name" = 'All In Medico Personal Accounts',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'medsphere-personal-accounts'
  AND "name" = 'MedSphere Personal Accounts';
