export class RegistrationResponseDto {
  id!: string;
  email!: string;
  firstName!: string;
  lastName!: string;
  status!: string;
  createdAt!: Date;

  constructor(
    partial: Pick<
      RegistrationResponseDto,
      'id' | 'email' | 'firstName' | 'lastName' | 'status' | 'createdAt'
    >,
  ) {
    Object.assign(this, partial);
  }
}
