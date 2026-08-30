import fs from 'node:fs';
import path from 'node:path';

const scanRoot = path.resolve(process.argv[2] ?? '.');
const webRoot = path.join(scanRoot, 'apps/web/src');
const centralBoundary = 'apps/web/src/lib/browser-permissions.ts';

const permissionApiPatterns = [
  /navigator\.geolocation/,
  /navigator\.mediaDevices/,
  /navigator\.permissions/,
  /Notification\.(?:permission|requestPermission)/,
];
const prohibitedPatterns = [
  /getUserMedia\(\s*\{[^}]*audio\s*:\s*(?:true|\{)/s,
  /navigator\.(?:contacts|bluetooth|sensors?)/,
  /\b(?:AmbientLightSensor|Accelerometer|Gyroscope|Magnetometer)\b/,
  /\bwebkitdirectory\b/,
  /\b(?:showOpenFilePicker|showDirectoryPicker|showSaveFilePicker)\b/,
  /navigator\.geolocation\.watchPosition/,
  /\b(?:sms|callLogs?)\.(?:request|read|query)\s*\(/i,
];

const findings = [];
for (const absolute of walk(webRoot)) {
  const relative = path.relative(scanRoot, absolute).split(path.sep).join('/');
  if (!/\.(?:ts|tsx)$/.test(relative) || /\.(?:test|spec)\.(?:ts|tsx)$/.test(relative)) continue;

  const source = fs.readFileSync(absolute, 'utf8');
  if (relative !== centralBoundary) {
    for (const pattern of permissionApiPatterns) {
      if (pattern.test(source)) findings.push(`${relative}: direct permission API ${pattern}`);
    }
  }
  for (const pattern of prohibitedPatterns) {
    if (pattern.test(source)) findings.push(`${relative}: prohibited V1 API ${pattern}`);
  }
}

if (findings.length > 0) {
  console.error('Browser permission boundary check failed:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log('Browser permission boundary check passed.');
}

function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}
