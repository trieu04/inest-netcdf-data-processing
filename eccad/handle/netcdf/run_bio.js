const { writeCsvForDay } = require('./bio.js');

// flags and arguments
let startDay = null;
let endDay = null;
let verbose = false;

async function main() {
  const args = process.argv.slice(2);
  args.forEach(arg => {
    if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (!isNaN(arg)) {
      if (startDay === null) {
        startDay = parseInt(arg, 10);
      } else if (endDay === null) {
        endDay = parseInt(arg, 10);
      }
    }
  });

  if (verbose) {
    console.log('Verbose mode enabled');
  }

  if (startDay === null || endDay === null || isNaN(startDay) || isNaN(endDay) || startDay > endDay) {
    console.error("Usage: node script.js <startDay> <endDay> [--verbose|-v]");
    process.exit(1);
  }

  for (let day = startDay; day <= endDay; day++) {
    const filePrefix = `bio`;
    const folder = "bio2";
    const message = await writeCsvForDay(day, filePrefix, folder);
    console.log(`${message} (${day - startDay + 1}/${endDay - startDay + 1})`);
  }
}

if (require.main === module) {
  main();
}
