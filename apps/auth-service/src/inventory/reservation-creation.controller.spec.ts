import { HEADERS_METADATA, HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS } from '../authorization/permission.constants';
import { REQUIRED_PERMISSIONS_KEY } from '../authorization/require-permissions.decorator';
import { InventoryController } from './inventory.controller';

describe('G3.16 reservation-creation HTTP contract', () => {
  it('uses only the protected assigned-provider private no-store route', () => {
    const handler = InventoryController.prototype.createReservation;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('providers/:providerId/reservations');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toEqual([
      PERMISSIONS.inventoryReservationsCreate,
    ]);
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual(
      expect.arrayContaining([{ name: 'Cache-Control', value: 'private, no-store' }]),
    );
  });
});
