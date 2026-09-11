/**
 * Task 0028 - Endpoint-contract characterization for the privacy-safe live
 * demand analytics read.
 *
 * Locks the accepted operational contract: the route is the preferred
 * `GET /inventory/providers/:providerId/availability-request-demand`, it is a
 * GET (read-only) route, and it is guarded by the accepted least-privilege
 * `inventory.availability-requests.read` permission — not a new analytics
 * permission.
 */
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { REQUIRED_PERMISSIONS_KEY } from '../authorization/require-permissions.decorator';
import { PERMISSIONS } from '../authorization/permission.constants';
import { InventoryController } from './inventory.controller';

describe('InventoryController availability-request-demand - Task 0028', () => {
  it('is mounted at the preferred provider-scoped demand route and is a GET read', () => {
    const method = InventoryController.prototype.readAvailabilityRequestDemand;

    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(
      'providers/:providerId/availability-request-demand',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(RequestMethod.GET);
  });

  it('reuses the accepted inventory.availability-requests.read permission', () => {
    const method = InventoryController.prototype.readAvailabilityRequestDemand;

    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, method)).toEqual([
      PERMISSIONS.inventoryAvailabilityRequestsRead,
    ]);
    expect(PERMISSIONS.inventoryAvailabilityRequestsRead).toBe(
      'inventory.availability-requests.read',
    );
  });

  it('does not invent a broader analytics permission for the read', () => {
    expect(Object.values(PERMISSIONS)).not.toContain('inventory.analytics.read');
    expect(Object.values(PERMISSIONS)).not.toContain(
      'inventory.availability-requests.analytics.read',
    );
  });

  it('delegates to the demand analytics service with identity, provider and query', async () => {
    const readDemand = jest
      .fn()
      .mockResolvedValue({ providerId: 'provider-a', totals: {}, products: [] });
    const controller = new InventoryController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { readDemand } as never,
    );

    const query = { days: 7, limit: 25 };
    const identity = { tenantId: 'tenant-a', membershipId: 'membership-a', userId: 'user-a' };

    const result = await controller.readAvailabilityRequestDemand(
      identity as never,
      'provider-a',
      query as never,
    );

    expect(readDemand).toHaveBeenCalledWith(identity, 'provider-a', query);
    expect(result).toEqual({ providerId: 'provider-a', totals: {}, products: [] });
  });
});
