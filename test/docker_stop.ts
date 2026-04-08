import test from 'tape';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('stopping docker network..', (t) => {
  t.timeoutAfter(10000);
  exec(`docker-compose -f ${__dirname}/docker-compose-testbed.yaml down`, (err, stdout, stderr) => {
    process.exit(0);
  });
  t.end();
});
