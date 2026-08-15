const fs = require('node:fs');
const prettier = require('prettier');

const files = [
  'apps/auth-service/src/notifications/notification.module.ts',
  'apps/auth-service/src/notifications/reservation-recipient-resolver.integration.spec.ts',
  'apps/auth-service/src/notifications/reservation-recipient-resolver.service.spec.ts',
  'apps/auth-service/src/notifications/reservation-recipient-resolver.service.ts',
  'docs/adr/0017-reservation-notification-recipient-resolution.md',
  'docs/adr/README.md',
  'docs/sprints/G3.25-reservation-recipient-resolution-boundary.md',
];

(async () => {
  let different = false;
  for (const file of files) {
    const input = fs.readFileSync(file, 'utf8');
    const formatted = await prettier.format(input, {
      filepath: file,
      printWidth: 100,
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
      tabWidth: 2,
    });
    if (formatted !== input) {
      different = true;
      const payload = Buffer.from(formatted, 'utf8').toString('base64');
      console.log(`::error file=${file},line=1::PRETTIER_BASE64:${payload}`);
    }
  }
  process.exitCode = different ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
