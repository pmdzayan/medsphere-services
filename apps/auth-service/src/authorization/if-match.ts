import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

const STRONG_VERSION_ETAG = /^"([1-9]\d*)"$/;

export function parseRequiredVersion(ifMatch: string | undefined): number {
  if (ifMatch === undefined) {
    throw new HttpException('If-Match header is required', HttpStatus.PRECONDITION_REQUIRED);
  }
  const match = STRONG_VERSION_ETAG.exec(ifMatch);
  if (!match) {
    throw new BadRequestException('If-Match must be one strong numeric entity tag');
  }
  const version = Number(match[1]);
  if (!Number.isSafeInteger(version)) {
    throw new BadRequestException('If-Match version is invalid');
  }
  return version;
}
