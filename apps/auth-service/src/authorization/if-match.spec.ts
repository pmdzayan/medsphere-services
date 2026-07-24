import { BadRequestException, HttpStatus } from '@nestjs/common';
import { parseRequiredVersion } from './if-match';

describe('parseRequiredVersion', () => {
  it('accepts one strong positive numeric entity tag', () => {
    expect(parseRequiredVersion('"17"')).toBe(17);
  });

  it('requires the precondition header', () => {
    try {
      parseRequiredVersion(undefined);
      throw new Error('Expected parseRequiredVersion to fail');
    } catch (error) {
      expect((error as { getStatus(): number }).getStatus()).toBe(HttpStatus.PRECONDITION_REQUIRED);
    }
  });

  it.each(['W/"1"', '1', '"0"', '"01"', '"1","2"', '*', '"9007199254740992"'])(
    'rejects a weak, malformed, ambiguous, or unsafe validator: %s',
    (value) => {
      expect(() => parseRequiredVersion(value)).toThrow(BadRequestException);
    },
  );
});
