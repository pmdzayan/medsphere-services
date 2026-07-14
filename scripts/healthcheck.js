// Dependency-free container healthcheck.
//
// Why this exists: the runtime image is gcr.io/distroless/nodejs20-debian12,
// which ships no shell and no wget/curl by design (smaller attack surface).
// The original healthchecks used `CMD-SHELL "wget -qO- ... | grep ..."`, which
// can never succeed in this image — CMD-SHELL requires /bin/sh, and wget
// doesn't exist here either. This script uses only Node's built-in http
// module, so `HEALTHCHECK CMD ["node", "healthcheck.js"]` works as-is.
const http = require('node:http');

const port = process.env.PORT || 3000;
const path = process.env.HEALTHCHECK_PATH || '/health/live';

const req = http.get({ host: 'localhost', port, path, timeout: 4000 }, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});

req.on('error', () => process.exit(1));
req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});
