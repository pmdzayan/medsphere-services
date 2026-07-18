import { Injectable } from '@nestjs/common';
import { InventoryRepository } from '../inventory/inventory.repository';
import { BatchRepository } from '../batch/batch.repository';
import { ExpiryService } from '../expiry/expiry.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockMovementType } from '../common/enums';
import { ANALYTICS_CONFIG } from './config/analytics.config';

export interface DashboardSummaryResult {
  totalProducts: number;
  totalInventoryItems: number;
  totalBatches: number;
  totalInventoryValue: number;
  availableStock: number;
  reservedStock: number;
  expiredStock: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface ExpiryAnalyticsResult {
  expiredToday: number;
  expiringWithin7Days: number;
  expiringWithin30Days: number;
  expiringWithin60Days: number;
}

export interface StockAnalyticsResult {
  fastMoving: number;
  slowMoving: number;
  deadStock: number;
  overstocked: number;
  frequentlyRestocked: number;
}

export interface FinancialAnalyticsResult {
  inventoryPurchaseValue: number;
  estimatedSellingValue: number;
  potentialProfit: number;
  inventoryLossDueToExpiry: number;
  inventoryLossDueToDamage: number;
}

export interface MonthlyMovement {
  month: string;
  year: number;
  quantity: number;
}

export interface ChartDataResult {
  monthlyStockIn: MonthlyMovement[];
  monthlyStockOut: MonthlyMovement[];
  monthlyExpiry: MonthlyMovement[];
  topSellingProducts: Array<{ productId: string; productName: string; totalQuantity: number }>;
  inventoryValueTrend: Array<{ month: string; year: number; value: number }>;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly batchRepository: BatchRepository,
    private readonly expiryService: ExpiryService,
    private readonly prisma: PrismaService,
  ) {}

  async getSummary(providerId: string): Promise<DashboardSummaryResult> {
    const [
      totalProducts,
      totalBatches,
      inventoryValue,
      outOfStockCount,
      expiryDashboard,
      inventoryItems,
      reservedStock,
    ] = await Promise.all([
      this.inventoryRepository.countByProvider(providerId),
      this.batchRepository.countByProvider(providerId),
      this.inventoryRepository.getInventoryValue(providerId),
      this.inventoryRepository.countOutOfStock(providerId),
      this.expiryService.getDashboard(providerId),
      this.getInventoryItemsCount(providerId),
      this.getReservedStock(providerId),
    ]);

    const lowStockCount = await this.inventoryRepository.countLowStock(providerId);

    return {
      totalProducts,
      totalInventoryItems: inventoryItems,
      totalBatches,
      totalInventoryValue: inventoryValue,
      availableStock: inventoryItems - reservedStock,
      reservedStock,
      expiredStock: expiryDashboard.totalExpired,
      lowStockCount,
      outOfStockCount,
    };
  }

  async getExpiryAnalytics(providerId: string): Promise<ExpiryAnalyticsResult> {
    const dashboard = await this.expiryService.getDashboard(providerId);
    return {
      expiredToday: dashboard.expiringToday,
      expiringWithin7Days: dashboard.expiringWithin7Days,
      expiringWithin30Days: dashboard.expiringWithin30Days,
      expiringWithin60Days: dashboard.expiringWithin60Days,
    };
  }

  async getStockAnalytics(providerId: string): Promise<StockAnalyticsResult> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - ANALYTICS_CONFIG.STOCK.DEAD_STOCK_DAYS);

    const inventoryItems = await this.prisma.client.inventory.findMany({
      where: { providerId, deletedAt: null },
      select: {
        id: true,
        quantity: true,
        minimumStockLevel: true,
        productId: true,
      },
    });

    let fastMoving = 0;
    let slowMoving = 0;
    let deadStock = 0;
    let overstocked = 0;
    let frequentlyRestocked = 0;

    for (const item of inventoryItems) {
      // Get stock-out movements in last 90 days
      const outMovements = await this.prisma.client.stockMovement.findMany({
        where: {
          inventoryId: item.id,
          type: StockMovementType.STOCK_OUT,
          createdAt: { gte: ninetyDaysAgo },
        },
        select: { quantity: true },
      });

      const totalOutQuantity = outMovements.reduce((sum, m) => sum + m.quantity, 0);
      const turnoverRate = item.quantity > 0 ? totalOutQuantity / item.quantity : 0;

      // Check for any recent movement (for dead stock detection)
      const recentMovement = await this.prisma.client.stockMovement.findFirst({
        where: {
          inventoryId: item.id,
          createdAt: { gte: ninetyDaysAgo },
        },
        select: { id: true },
      });

      if (item.quantity <= 0) {
        deadStock++;
      } else if (
        item.quantity > item.minimumStockLevel * ANALYTICS_CONFIG.STOCK.OVERSTOCK_MULTIPLIER &&
        turnoverRate < ANALYTICS_CONFIG.STOCK.SLOW_MOVING_TURNOVER
      ) {
        overstocked++;
      } else if (turnoverRate > ANALYTICS_CONFIG.STOCK.FAST_MOVING_TURNOVER) {
        fastMoving++;
      } else if (turnoverRate < ANALYTICS_CONFIG.STOCK.SLOW_MOVING_TURNOVER && item.quantity > 0) {
        if (!recentMovement) {
          deadStock++;
        } else {
          slowMoving++;
        }
      }

      // Frequently restocked: items with multiple STOCK_IN movements in last 90 days
      const stockInCount = await this.prisma.client.stockMovement.count({
        where: {
          inventoryId: item.id,
          type: StockMovementType.STOCK_IN,
          createdAt: { gte: ninetyDaysAgo },
        },
      });
      if (stockInCount >= 2) {
        frequentlyRestocked++;
      }
    }

    return { fastMoving, slowMoving, deadStock, overstocked, frequentlyRestocked };
  }

  async getFinancialAnalytics(providerId: string): Promise<FinancialAnalyticsResult> {
    // Get batch purchase prices for cost calculation
    const batches = await this.prisma.client.batch.findMany({
      where: { providerId, deletedAt: null },
      select: {
        currentQuantity: true,
        purchasePrice: true,
        sellingPrice: true,
        status: true,
      },
    });

    let inventoryPurchaseValue = 0;
    let estimatedSellingValue = 0;
    let inventoryLossDueToExpiry = 0;
    let inventoryLossDueToDamage = 0;

    for (const batch of batches) {
      const purchaseValue = batch.currentQuantity * Number(batch.purchasePrice);
      const sellingValue = batch.currentQuantity * Number(batch.sellingPrice);
      inventoryPurchaseValue += purchaseValue;
      estimatedSellingValue += sellingValue;

      if (batch.status === 'EXPIRED') {
        inventoryLossDueToExpiry += purchaseValue;
      }
    }

    // Get damage loss from stock movements
    const damageMovements = await this.prisma.client.stockMovement.findMany({
      where: {
        providerId,
        type: StockMovementType.DAMAGED,
        deletedAt: null,
      },
      select: { quantity: true },
    });
    inventoryLossDueToDamage = damageMovements.reduce((sum, m) => sum + m.quantity, 0);

    const potentialProfit = estimatedSellingValue - inventoryPurchaseValue;

    return {
      inventoryPurchaseValue: Math.round(inventoryPurchaseValue * 100) / 100,
      estimatedSellingValue: Math.round(estimatedSellingValue * 100) / 100,
      potentialProfit: Math.round(potentialProfit * 100) / 100,
      inventoryLossDueToExpiry: Math.round(inventoryLossDueToExpiry * 100) / 100,
      inventoryLossDueToDamage,
    };
  }

  async getChartData(providerId: string): Promise<ChartDataResult> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Monthly stock in/out/expiry
    const movements = await this.prisma.client.stockMovement.findMany({
      where: {
        providerId,
        createdAt: { gte: sixMonthsAgo },
        deletedAt: null,
      },
      select: {
        type: true,
        quantity: true,
        createdAt: true,
        productId: true,
      },
    });

    const monthlyStockIn: Map<string, number> = new Map();
    const monthlyStockOut: Map<string, number> = new Map();
    const monthlyExpiry: Map<string, number> = new Map();
    const productSales: Map<string, { name: string; total: number }> = new Map();
    for (const m of movements) {
      const key = `${m.createdAt.getFullYear()}-${String(m.createdAt.getMonth() + 1).padStart(2, '0')}`;

      if (m.type === StockMovementType.STOCK_IN) {
        monthlyStockIn.set(key, (monthlyStockIn.get(key) ?? 0) + m.quantity);
      } else if (m.type === StockMovementType.STOCK_OUT) {
        monthlyStockOut.set(key, (monthlyStockOut.get(key) ?? 0) + m.quantity);
      } else if (m.type === StockMovementType.EXPIRED) {
        monthlyExpiry.set(key, (monthlyExpiry.get(key) ?? 0) + m.quantity);
      }
    }

    // Top selling products
    const stockOutMovements = movements.filter((m) => m.type === StockMovementType.STOCK_OUT);
    for (const m of stockOutMovements) {
      if (!productSales.has(m.productId)) {
        productSales.set(m.productId, { name: m.productId, total: 0 });
      }
      productSales.get(m.productId)!.total += m.quantity;
    }

    // Get product names for top sellers
    const topSellingProducts = await Promise.all(
      Array.from(productSales.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10)
        .map(async ([productId, data]) => {
          const product = await this.prisma.client.product.findUnique({
            where: { id: productId },
            select: { name: true },
          });
          return {
            productId,
            productName: product?.name ?? 'Unknown',
            totalQuantity: data.total,
          };
        }),
    );

    // Inventory value trend (monthly snapshot)
    const inventoryItems = await this.prisma.client.inventory.findMany({
      where: { providerId, deletedAt: null },
      select: { quantity: true, sellingPrice: true },
    });
    const currentValue = inventoryItems.reduce(
      (sum, item) => sum + item.quantity * Number(item.sellingPrice),
      0,
    );
    const inventoryValueTrend = Array.from(monthlyStockIn.keys())
      .sort()
      .map((key) => {
        const [year, month] = key.split('-');
        return { month, year: parseInt(year), value: currentValue };
      });

    return {
      monthlyStockIn: this.mapToMonthlyArray(monthlyStockIn),
      monthlyStockOut: this.mapToMonthlyArray(monthlyStockOut),
      monthlyExpiry: this.mapToMonthlyArray(monthlyExpiry),
      topSellingProducts,
      inventoryValueTrend,
    };
  }

  private async getInventoryItemsCount(providerId: string): Promise<number> {
    return this.prisma.client.inventory.count({
      where: { providerId, deletedAt: null },
    });
  }

  private async getReservedStock(providerId: string): Promise<number> {
    const items = await this.prisma.client.inventory.findMany({
      where: { providerId, deletedAt: null },
      select: { reservedQuantity: true },
    });
    return items.reduce((sum, item) => sum + item.reservedQuantity, 0);
  }

  private mapToMonthlyArray(
    map: Map<string, number>,
  ): Array<{ month: string; year: number; quantity: number }> {
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, quantity]) => {
        const [year, month] = key.split('-');
        return { month, year: parseInt(year), quantity };
      });
  }
}
