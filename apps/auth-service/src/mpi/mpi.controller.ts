import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { MpiService } from './mpi.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantRbacGuard } from '../common/guards/tenant-rbac.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('MPI - Master Patient Index')
@Controller('mpi')
@UseGuards(JwtAuthGuard, TenantRbacGuard)
@ApiHeader({ name: 'x-tenant-id', description: 'Tenant ID for patient scoping', required: true })
@ApiHeader({
  name: 'x-correlation-id',
  description: 'Correlation ID for audit tracing',
  required: false,
})
export class MpiController {
  constructor(private readonly mpiService: MpiService) {}

  @Post('patients')
  @RequirePermissions({ resource: 'mpi', action: 'create' })
  @ApiOperation({ summary: 'Register a new patient and run matching' })
  @ApiResponse({ status: 201, description: 'Patient created with match candidates' })
  @ApiResponse({ status: 409, description: 'Duplicate MRN in tenant' })
  async createPatient(@Body() dto: CreatePatientDto) {
    return this.mpiService.createPatient(dto);
  }

  @Get('patients')
  @RequirePermissions({ resource: 'mpi', action: 'read' })
  @ApiOperation({ summary: 'List patients for the current tenant' })
  @ApiResponse({ status: 200, description: 'Paginated patient list' })
  async findPatientsByTenant(
    @CurrentUser() user: { sub: string; tenantId?: string },
    @Query('tenantId') tenantId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.mpiService.findPatientsByTenant(
      tenantId ?? '00000000-0000-0000-0000-000000000000',
      skip ? parseInt(skip, 10) : undefined,
      take ? parseInt(take, 10) : undefined,
    );
  }

  @Get('patients/:id')
  @RequirePermissions({ resource: 'mpi', action: 'read' })
  @ApiOperation({ summary: 'Get patient by ID' })
  @ApiResponse({ status: 200, description: 'Patient details' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async findPatientById(@Param('id') id: string) {
    return this.mpiService.findPatientById(id);
  }

  @Get('mrn/:mrn')
  @RequirePermissions({ resource: 'mpi', action: 'read' })
  @ApiOperation({ summary: 'Find patient by MRN within a tenant' })
  async findPatientByTenantMrn(
    @CurrentUser() user: { sub: string; tenantId?: string },
    @Param('mrn') mrn: string,
  ) {
    return this.mpiService.findPatientByTenantMrn(
      user.tenantId ?? '00000000-0000-0000-0000-000000000000',
      mrn,
    );
  }

  @Put('patients/:id')
  @RequirePermissions({ resource: 'mpi', action: 'update' })
  @ApiOperation({ summary: 'Update patient details' })
  @ApiResponse({ status: 200, description: 'Patient updated' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async updatePatient(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.mpiService.updatePatient(id, dto as never);
  }

  @Delete('patients/:id')
  @RequirePermissions({ resource: 'mpi', action: 'delete' })
  @ApiOperation({ summary: 'Soft delete a patient' })
  @ApiResponse({ status: 200, description: 'Patient deleted' })
  async deletePatient(@Param('id') id: string) {
    await this.mpiService.deletePatient(id);
    return { message: 'Patient deleted successfully' };
  }

  @Get('patients/:id/matches')
  @RequirePermissions({ resource: 'mpi', action: 'read' })
  @ApiOperation({ summary: 'Find matching patients across tenants' })
  async findMatches(@Param('id') id: string) {
    return this.mpiService.findMatches(id);
  }

  @Get('patients/:id/links')
  @RequirePermissions({ resource: 'mpi', action: 'read' })
  @ApiOperation({ summary: 'Get all links for a patient' })
  async getPatientLinks(@Param('id') id: string) {
    return this.mpiService.getPatientLinks(id);
  }

  @Post('links/:linkId/verify')
  @RequirePermissions({ resource: 'mpi', action: 'update' })
  @ApiOperation({ summary: 'Verify a patient link after manual review' })
  async verifyPatientLink(@Param('linkId') linkId: string, @CurrentUser() user: { sub: string }) {
    return this.mpiService.verifyPatientLink(linkId, user.sub);
  }

  @Post('patients/:patientId/identifiers')
  @RequirePermissions({ resource: 'mpi', action: 'update' })
  @ApiOperation({ summary: 'Add an identifier to a patient' })
  async addIdentifier(
    @Param('patientId') patientId: string,
    @Body() dto: { type: string; value: string; isPrimary?: boolean },
  ) {
    return this.mpiService.addIdentifier({
      patientId,
      type: dto.type,
      value: dto.value,
      isPrimary: dto.isPrimary,
    });
  }
}
