import { validateAuditMetadata } from '../../../../packages/database/src/audit';

function main() {
  console.log(
    '=== Real, unmocked validateAuditMetadata regression (candidate Task 0032, correction pass 1) ===',
  );

  // Mirrors EXACTLY what PatientProfileService.updateOwnProfile now
  // constructs: changedFieldNames sorted and comma-joined into a
  // single scalar string, never an array.
  const realMetadataShape = { fieldsChanged: 'firstName,lastName,preferredLanguage' };
  const validated = validateAuditMetadata('patient.profile.updated', realMetadataShape);
  console.log(
    'PASS: real metadata shape { fieldsChanged: <string> } is accepted by the real validateAuditMetadata.',
  );
  console.log('Validated value:', JSON.stringify(validated));

  // Contrast: the OLD, buggy design (an array) -- proving the bug this
  // correction pass fixes was real, and that the fix is necessary.
  let oldDesignRejected = false;
  try {
    validateAuditMetadata('patient.profile.updated', { fieldsChanged: ['firstName', 'lastName'] });
  } catch (error) {
    oldDesignRejected = true;
    console.log(
      'CONFIRMED: the OLD array-valued design is genuinely rejected:',
      (error as Error).message,
    );
  }
  if (!oldDesignRejected) {
    throw new Error(
      'FAIL: the old array-based metadata design was not rejected -- the bug this pass fixes may not be real',
    );
  }

  // Prove raw values never appear: a metadata object containing an
  // actual new name value (not just field names) must be rejected,
  // since 'newFirstName'/'newLastName'-style keys are not in this
  // event type's allowed-key list.
  let rawValueKeyRejected = false;
  try {
    validateAuditMetadata('patient.profile.updated', {
      fieldsChanged: 'firstName',
      firstName: 'Priya',
    } as never);
  } catch (error) {
    rawValueKeyRejected = true;
    console.log(
      'CONFIRMED: a metadata object smuggling a raw field value under its own key is rejected:',
      (error as Error).message,
    );
  }
  if (!rawValueKeyRejected) {
    throw new Error('FAIL: a raw value smuggled under an unexpected key was not rejected');
  }

  console.log('\nALL REAL AUDIT METADATA VALIDATOR TESTS PASSED');
}

main();
