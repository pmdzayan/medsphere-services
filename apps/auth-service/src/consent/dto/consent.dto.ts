import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  CONSENT_CATEGORIES,
  CONSENT_SOURCES,
  ConsentCategory,
  ConsentSource,
} from '../consent-category';

export class RecordConsentDto {
  @ApiProperty({ enum: CONSENT_CATEGORIES })
  @IsIn(CONSENT_CATEGORIES)
  category!: ConsentCategory;

  @ApiProperty({ enum: ['GRANTED', 'WITHDRAWN'] })
  @IsIn(['GRANTED', 'WITHDRAWN'])
  status!: 'GRANTED' | 'WITHDRAWN';

  @ApiProperty({ enum: CONSENT_SOURCES })
  @IsIn(CONSENT_SOURCES)
  source!: ConsentSource;
}

export class ConsentStatusDto {
  @ApiProperty({ enum: CONSENT_CATEGORIES })
  category!: ConsentCategory;

  @ApiProperty({ enum: ['GRANTED', 'WITHDRAWN'], nullable: true })
  status!: 'GRANTED' | 'WITHDRAWN' | null;

  @ApiProperty({ nullable: true })
  updatedAt!: string | null;
}

export class ConsentStatusListResponseDto {
  @ApiProperty({ type: [ConsentStatusDto] })
  data!: ConsentStatusDto[];
}
