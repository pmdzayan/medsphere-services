import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryIntelligenceResult } from '../common/interfaces';
import { StockHealth } from '../common/enums';
import { InventoryRepository } from '../inventory/inventory.repository';

@Injectable()
export class InventoryIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryRepository: InventoryRepository,
  ) {}

  /**
   * Analyzes inventory health for all products belonging to a provider.
   * Uses rule-based calculations:
   * - LOW_STOCK: quantity <= minimumStockLevel AND quantity > 0
   * - OUT_OF_STOCK: quantity = 0
   * - FAST_MOVING: turnover rate > 5 (based on total stock movement out / avg quantity)
   * - SLOW_MOVING: turnover rate < 1 AND quantity > 0
   * - DEAD_STOCK: no movement in last 90 days AND quantity > 0
   * - OVERSTOCK: quantity > minimumStockLevel * 3
   */
  async analyze(providerId: string): Promise<InventoryIntelligenceResult[]> {
    const inventoryItems = await this.prisma.client.inventory.findMany({
      where: { providerId, deletedAt: null },
      include: { product: true },
    });

    const results: InventoryIntelligenceResult[] = [];

    for (const item of inventoryItems) {
      const health = await this.determineStockHealth(providerId, item);
      results.push(health);
    }

    return results;
  }

  async getLowStockItems(providerId: string): Promise<InventoryIntelligenceResult[]> {
    const all = await this.analyze(providerId);
    return all.filter((r) => r.health === StockHealth.LOW_STOCK);
  }

  async getOverstockItems(providerId: string): Promise<InventoryIntelligenceResult[]> {
    const all = await this.analyze(providerId);
    return all.filter((r) => r.health === StockHealth.OVERSTOCK);
  }

  async getFastMovingItems(providerId: string): Promise<InventoryIntelligenceResult[]> {
    const all = await this.analyze(providerId);
    return all.filter((r) => r.health === StockHealth.FAST_MOVING);
  }

  async getSlowMovingItems(providerId: string): Promise<InventoryIntelligenceResult[]> {
    const all = await this.analyze(providerId);
    return all.filter((r) => r.health === StockHealth.SLOW_MOVING);
  }

  async getDeadStockItems(providerId: string): Promise<InventoryIntelligenceResult[]> {
    const all = await this.analyze(providerId);
    return all.filter((r) => r.health === StockHealth.DEAD_STOCK);
  }

  private async determineStockHealth(
    providerId: string,
    item: {
      id: string;
      productId: string;
      quantity: number;
      minimumStockLevel: number;
      sku: string | null;
      product: { name: string };
    },
  ): Promise<InventoryIntelligenceResult> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Calculate turnover rate (total out movements in last 90 days / average quantity)
    const movements = await this.prisma.client.stockMovement.findMany({
      where: {
        inventoryId: item.id,
        type: 'STOCK_OUT',
        createdAt: { gte: ninetyDaysAgo },
      },
      select: { quantity: true },
    });

    const totalOutQuantity = movements.reduce((sum, m) => sum + m.quantity, 0);
    const turnoverRate = item.quantity > 0 ? totalOutQuantity / item.quantity : 0;

    // Determine stock health
    let health: string;
    let recommendation: string;

    if (item.quantity <= 0) {
      health = StockHealth.DEAD_STOCK;
      recommendation = 'Out of stock. Consider restocking if demand exists.';
    } else if (item.quantity <= item.minimumStockLevel) {
      health = StockHealth.LOW_STOCK;
      recommendation = `Low stock (${item.quantity} units). Reorder soon to avoid stockout.`;
    } else if (item.quantity > item.minimumStockLevel * 3 && turnoverRate < 1) {
      health = StockHealth.OVERSTOCK;
      recommendation = `Overstocked (${item.quantity} units). Consider reducing order quantity.`;
    } else if (turnoverRate > 5) {
      health = StockHealth.FAST_MOVING;
      recommendation = 'Fast moving item. Ensure adequate stock levels.';
    } else if (turnoverRate < 1 && item.quantity > 0) {
      // Check if no movement in last 90 days
      const recentMovement = await this.prisma.client.stockMovement.findFirst({
        where: {
          inventoryId: item.id,
          createdAt: { gte: ninetyDaysAgo },
        },
      });

      if (!recentMovement) {
        health = StockHealth.DEAD_STOCK;
        recommendation = 'No movement in 90+ days. Consider discounting or returning.';
      } else {
        health = StockHealth.SLOW_MOVING;
        recommendation = 'Slow moving item. Review pricing and demand.';
      }
    } else {
      health = StockHealth.NORMAL;
      recommendation = 'Stock level is healthy.';
    }

    return {
      productId: item.productId,
      productName: item.product.name,
      sku: item.sku,
      currentQuantity: item.quantity,
      minimumStockLevel: item.minimumStockLevel,
      health,
      turnoverRate: Math.round(turnoverRate * 100) / 100,
      daysUntilOutOfStock: turnoverRate > 0 ? Math.round(item.quantity / turnoverRate) : undefined,
      recommendation,
    };
  }
}
