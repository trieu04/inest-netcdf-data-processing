const {
  emissionMapBoxResidentialMap,
  emissionMapBoxStrawDxMap,
  emissionMapBoxStrawHtMap,
  emissionMapBoxAreaSourceTrafficWeekdayMap,
  emissionMapBoxAreaSourceTrafficWeekendMap,
  emissionMapBoxIndustrySmallMap,
  emissionMapBoxIndustryLargeMap,
  emissionMapBoxPowerPlantMap,
  emissionMapBoxMaterialMap,
  convertFactor,
  zeroMapObject,
  residential,
  strawDx,
  strawHt,
  areaSourceTraffic,
  industrySmall,
  industryLarge,
  powerPlant,
  material,
  writeCsvForDay,
  outputDir,
  mongoDisconnect,
  redisDisconnect,
} = require('./emissionNetcdf');

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

  if (isNaN(startDay) || isNaN(endDay) || startDay > endDay) {
    console.error("Usage: node script.js <startDay> <endDay> [--verbose|-v]");
    process.exit(1);
  }

  // await residential();
  await strawDx();
  await strawHt();
  // await areaSourceTraffic();
  // await industrySmall();
  // await industryLarge();
  // await powerPlant();
  // await material();

  mongoDisconnect();
  redisDisconnect();

  logSum();

  for (let day = startDay; day <= endDay; day++) {
    const filePrefix = `all_straw_emission`;
    const folder = "straw";
    const message = await writeCsvForDay(day, filePrefix, folder);
    console.log(`${message} (${day - startDay + 1}/${endDay - startDay + 1})`);
    logMemoryUsage();
  }
}

if (require.main === module) {
  main();
}

function logSum() {
  if (!verbose) return;
  console.log("Calculating total emissions for each pollutant...");
  const sum = (map) => {
    const totals = { ...zeroMapObject };
    for (const [key, { row, col, ...values }] of map.entries()) {
      for (const pollutant in values) {
        if (!totals[pollutant]) {
          totals[pollutant] = 0;
        }
        totals[pollutant] += values[pollutant];
      }
    }
    for (const pollutant in totals) {
      totals[pollutant] = Math.round(totals[pollutant] * 100) / 100;
    }
    return totals;
  }
  const residentialTotals = sum(emissionMapBoxResidentialMap); console.log("Total emissions residential (t/day):", residentialTotals);
  const strawDxTotals = sum(emissionMapBoxStrawDxMap); console.log("Total emissions strawDx (t/day):", strawDxTotals);
  const strawHtTotals = sum(emissionMapBoxStrawHtMap); console.log("Total emissions strawHt (t/day):", strawHtTotals);
  const areaSourceTrafficWeekdayTotals = sum(emissionMapBoxAreaSourceTrafficWeekdayMap); console.log("Total emissions areaSourceTrafficWeekday (t/day):", areaSourceTrafficWeekdayTotals);
  const areaSourceTrafficWeekendTotals = sum(emissionMapBoxAreaSourceTrafficWeekendMap); console.log("Total emissions areaSourceTrafficWeekend (t/day):", areaSourceTrafficWeekendTotals);
  const industrySmallTotals = sum(emissionMapBoxIndustrySmallMap); console.log("Total emissions industrySmall (t/day):", industrySmallTotals);
  const industryLargeTotals = sum(emissionMapBoxIndustryLargeMap); console.log("Total emissions industryLarge (t/day):", industryLargeTotals);
  const powerPlantTotals = sum(emissionMapBoxPowerPlantMap); console.log("Total emissions powerPlant (t/day):", powerPlantTotals);
  const materialTotals = sum(emissionMapBoxMaterialMap); console.log("Total emissions material (t/day):", materialTotals);
}

function logMemoryUsage() {
  if (!verbose) return;
  const m = process.memoryUsage();
  console.log(
    'rss', (m.rss / 1e6).toFixed(0), 'MB',
    'heap', (m.heapUsed / 1e6).toFixed(0), 'MB',
    'ext', (m.external / 1e6).toFixed(0), 'MB',
    'ab', (m.arrayBuffers / 1e6).toFixed(0), 'MB'
  );
}
