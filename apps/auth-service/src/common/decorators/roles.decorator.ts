import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Declare one or more role names required to access a handler or controller.
 *
 * The RolesGuard (registered as a global or controller-scoped guard) enforces
 * that the authenticated user has at least one of the specified roles.
 *
 * @example
 * ```ts
 * @Roles('Pharmacist', 'Doctor')
 * @Get('prescriptions')
 * async findPrescriptions() { ... }
 * ```
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
