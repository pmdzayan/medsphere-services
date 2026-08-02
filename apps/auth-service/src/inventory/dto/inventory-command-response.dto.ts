import { ApiProperty } from '@nestjs/swagger';

export class InventoryConfigurationResponseDto {
  @ApiProperty({ format: 'uuid' })
  inventoryId!: string;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty()
  replayed!: boolean;
}

export class StockMutationResponseDto {
  @ApiProperty({ format: 'uuid' })
  inventoryId!: string;

  @ApiProperty({ format: 'uuid' })
  batchId!: string;

  @ApiProperty({ format: 'uuid' })
  movementId!: string;

  @ApiProperty()
  onHandBefore!: number;

  @ApiProperty()
  onHandAfter!: number;

  @ApiProperty({ minimum: 1 })
  batchVersion!: number;

  @ApiProperty()
  replayed!: boolean;
}
