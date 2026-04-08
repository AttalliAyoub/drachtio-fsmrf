import test from 'tape';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleepFor = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('starting docker network..', (t) => {
  t.plan(1);
  exec(`docker-compose -f ${__dirname}/docker-compose-testbed.yaml up -d`, async (err, stdout, stderr) => {
    console.log('docker network started, giving extra time for freeswitch to initialize...');
    await testFreeswitches(['freeswitch-sut', 'freeswitch-uac'], 35000);
    t.pass('docker is up');
  });
});

const testFreeswitches = async (arr: string[], timeout: number) => {
  const timer = setTimeout(() => {
    throw new Error('timeout waiting for freeswitches to come up');
  }, timeout);

  do {
    await sleepFor(5000);
    try {
      await Promise.all(arr.map((freeswitch) => testOneFsw(freeswitch)));
      clearTimeout(timer);
      return;
    } catch (err) {
    }
  } while (true);
};

function testOneFsw(fsw: string) {
  return new Promise((resolve, reject) => {
    exec(`docker exec ${fsw} fs_cli -x "console loglevel debug"`, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve(err);
    });
  });
}
