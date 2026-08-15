const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
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

function escapeWorkflowCommand(value) {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

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
      const temporary = path.join(os.tmpdir(), `formatted-${path.basename(file)}`);
      fs.writeFileSync(temporary, formatted, 'utf8');
      const result = spawnSync('diff', ['-u', file, temporary], { encoding: 'utf8' });
      const diff = result.stdout || `Prettier differs for ${file}`;
      console.log(`::error file=${file},line=1::${escapeWorkflowCommand(diff)}`);
    }
  }
  process.exitCode = different ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
