import { IsEnum } from 'class-validator';
import { EncounterStatus } from '../enums';

export class UpdateEncounterStatusDto {
  @IsEnum(EncounterStatus)
  status!: EncounterStatus;
}
