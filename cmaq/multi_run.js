const { spawn } = require('child_process');
const path = require('path');

const START_YEAR_DAY = 1;
const END_YEAR_DAY = 365;
const TOTAL_DAYS = END_YEAR_DAY - START_YEAR_DAY + 1;
const THREADS = 8;
const DAYS_PER_THREAD = Math.floor(TOTAL_DAYS / THREADS);
const REMAINDER = TOTAL_DAYS % THREADS;

let currStart = START_YEAR_DAY;
const promises = [];

for (let i = 0; i < THREADS; i++) {
  const extra = i < REMAINDER ? 1 : 0;
  const range = DAYS_PER_THREAD + extra;
  const currEnd = currStart + range - 1;

  console.log(`Starting thread ${i} for range ${currStart} to ${currEnd}`);

  const runScript = spawn('node', [
    path.join(__dirname, 'run.js'),
    currStart.toString(),
    currEnd.toString(),
  ]);

  runScript.stdout.on('data', (data) => {
    process.stdout.write(`[Thread ${i}] ${data}`);
  });

  runScript.stderr.on('data', (data) => {
    process.stderr.write(`[Thread ${i} ERROR] ${data}`);
  });

  promises.push(
    new Promise((resolve, reject) => {
      runScript.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Thread ${i} exited with code ${code}`));
        }
      });
    })
  );

  currStart = currEnd + 1;
}

Promise.all(promises)
  .then(() => {
    console.log('All threads finished.');
  })
  .catch((err) => {
    console.error('One or more threads failed:', err);
  });
