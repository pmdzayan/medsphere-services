# Runtime Certification — Inventory

## Scope

This branch certifies the Inventory vertical slice only. Dashboard runtime certification is already merged and is treated as a prerequisite. Reservations, Notifications, Maps, FHIR, ABDM, and unrelated product work are out of scope.

## Starting evidence

The live Task 5 smoke run previously reached Inventory with the real backend/frontend/PostgreSQL/Redis stack and reported:

- inventory listing creation (`configureInventory`): HTTP 400
- batch receipt (`receiveBatch`): HTTP 404 / 404

## Contract investigation

The accepted backend route exists:

- `PUT /inventory/providers/:providerId/products/:productId`
- `POST /inventory/providers/:providerId/products/:productId/batches`

`ConfigureInventoryDto` requires all of the following fields:

- `sellingPrice`
- `mrp`
- `discountPercentage`
- `taxPercentage`
- `minimumStockLevel`
- `isVisible`
- `idempotencyKey`

The current smoke harness sends the pricing fields and `idempotencyKey` but omits the required `minimumStockLevel` and `isVisible` fields. Therefore the observed HTTP 400 is currently classified as a smoke-harness payload defect, not a proven Inventory product defect.

The subsequent batch 404/404 is currently treated as a likely cascade: if inventory configuration never succeeds, the provider-product inventory listing required by `receiveBatch` does not exist.

## Required next validation

1. Correct only the smoke payload to match the accepted `ConfigureInventoryDto` contract.
2. Re-run the real Inventory runtime path against PostgreSQL/Redis.
3. Require successful inventory configuration and two successful batch receipts.
4. Then verify stock read semantics against the seeded product/batches.
5. Do not touch Inventory product implementation unless the corrected harness reproduces an actual product defect.
6. Do not begin Reservations or later capabilities until Inventory certification is green and accepted.
