-- Task 0044 enum expansion prelude.
-- PostgreSQL requires newly-added enum labels to be committed before later
-- migrations can safely reference them in constraints, functions, or triggers.

ALTER TYPE "BatchStatus" ADD VALUE IF NOT EXISTS 'RECALLED';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'DISPOSAL';
