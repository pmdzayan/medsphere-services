# Inventory Assessment Summary

> **Historical assessment:** This file predates the 2026-07-20 CTO baseline audit. Its "minimal" change plan is not approved for implementation because it does not resolve the competing Inventory/Batch sources of truth, transaction-client misuse, reservation concurrency, tenant isolation, migration mismatch, or audit requirements. Follow `PROJECT_STATUS.md`, `PRODUCT_ROADMAP.md`, and ADR-001.

## Current Architecture Review

### Existing Modules:

1. **StockMovementModule** - Controller, Service, Repository, DTOs (CreateStockMovementDto, StockMovementResponseDto)
2. **InventoryModule** - Repository only (findById, findAll, update, softDelete, FEFO)
3. **BatchModule** - Full CRUD (Service, Controller, Repository, Tests)
4. **InventoryHistoryModule** - Repository, Controller, DTO
5. **PrismaModule** - Wraps @medsphere/database client

### Prisma Schema Inventory Models:

- **Inventory** - id, providerId, productId, batchNumber, expiryDate, quantity, reservedQuantity, prices, etc. Has `stockMovements[]`
- **Batch** - id, providerId, productId, batchNumber, manufacturingDate, expiryDate, initialQuantity, currentQuantity, prices, status. Has `stockMovements[]`
- **StockMovement** - id, inventoryId, batchId?, providerId, productId, type, quantity, quantityBefore, quantityAfter, referenceType?, referenceId?, reason?, notes?, userId, version, timestamps, deletedAt? Linked to Inventory and Batch
- **InventoryHistory** - Similar fields, immutable (no updatedAt, no soft-delete)

### Existing StockMovementType Enum:

STOCK_IN, STOCK_OUT, ADJUSTMENT, TRANSFER_IN, TRANSFER_OUT, RETURN

### Missing for Requirements:

- RETURN_IN, RETURN_OUT, EXPIRED, DAMAGED types needed
- No auth guards on movement endpoints
- No transaction support
- No expired batch validation for STOCK_OUT
- No date range filtering
- Pagination partial support
- No tests for stock-movement

### Changes Needed (Minimal):

1. Update Prisma schema enum - add missing types
2. Update enums.ts
3. Enhance repository with date range + pagination
4. Rewrite service with business rules + transactions
5. Add auth guard integration
6. Add validation DTOs per movement type
7. Write tests
