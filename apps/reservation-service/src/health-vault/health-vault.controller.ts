import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { HealthVaultService } from './health-vault.service';
import { UploadMedicalRecordDto } from './dto/upload-medical-record.dto';
import { UpdateMedicalRecordDto } from './dto/update-medical-record.dto';
import { MedicalRecordResponseDto } from './dto/medical-record-response.dto';

@Controller('health-vault')
export class HealthVaultController {
  constructor(private readonly service: HealthVaultService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Body() dto: UploadMedicalRecordDto,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @UploadedFile() file: any,
  ): Promise<MedicalRecordResponseDto> {
    // TODO: Extract userId from authenticated user context
    const userId = '00000000-0000-0000-0000-000000000000';
    return this.service.upload(userId, dto, file);
  }

  @Get()
  async findAll(): Promise<MedicalRecordResponseDto[]> {
    // TODO: Extract userId from authenticated user context
    const userId = '00000000-0000-0000-0000-000000000000';
    return this.service.findByUser(userId);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<MedicalRecordResponseDto> {
    // TODO: Extract userId from authenticated user context
    const userId = '00000000-0000-0000-0000-000000000000';
    return this.service.findById(userId, id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMedicalRecordDto,
  ): Promise<MedicalRecordResponseDto> {
    // TODO: Extract userId from authenticated user context
    const userId = '00000000-0000-0000-0000-000000000000';
    return this.service.update(userId, id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    // TODO: Extract userId from authenticated user context
    const userId = '00000000-0000-0000-0000-000000000000';
    return this.service.remove(userId, id);
  }
}
