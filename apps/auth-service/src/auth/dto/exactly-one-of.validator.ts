import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * Requires exactly one of the named request properties to be supplied.
 *
 * Attach this validator to a required DTO property that is always validated.
 * The named credential fields retain their own format/length validation.
 */
export function ExactlyOneOf(
  properties: readonly string[],
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'exactlyOneOf',
      target: target.constructor,
      propertyName: String(propertyName),
      constraints: [properties],
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const [propertyNames] = args.constraints as [readonly string[]];
          const object = args.object as Record<string, unknown>;

          const suppliedCount = propertyNames.reduce(
            (count, name) => count + (object[name] !== undefined ? 1 : 0),
            0,
          );

          return suppliedCount === 1;
        },

        defaultMessage(args: ValidationArguments): string {
          const [propertyNames] = args.constraints as [readonly string[]];
          return `Exactly one of ${propertyNames.join(' or ')} must be provided`;
        },
      },
    });
  };
}
