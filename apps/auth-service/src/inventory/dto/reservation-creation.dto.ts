import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProviderReservationItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 2_147_483_647 })
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  quantity!: number;
}

export class CreateProviderReservationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  subjectUserId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  expiresAt!: string;

  @ApiProperty({ type: [CreateProviderReservationItemDto], minItems: 1, maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateProviderReservationItemDto)
  items!: CreateProviderReservationItemDto[];

  @ApiProperty({ minLength: 8, maxLength: 120 })
  @Transform(trimString)
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  idempotencyKey!: string;
}
