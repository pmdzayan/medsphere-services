/**
 * Base class for MedSphere's own business-rule errors (as opposed to
 * infrastructure/unexpected errors). Throwing a DomainException anywhere in
 * a service gives GlobalExceptionFilter enough information to return a
 * consistent, safe error envelope — see filters/global-exception.filter.ts.
 *
 * Example: throw new DomainException('RESERVATION_EXPIRED', 'This reservation has expired.', 409);
 */
export class DomainException extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = 'DomainException';
  }
}
