process.env.NODE_ENV = 'development';
require("../../v1/databases/init.mongodb");
const fs = require('fs');
const path = require('path');
const fastcsv = require('fast-csv');
const { ResidentialHourlyEmissionFactorModel } = require('../../v1/population/models/index.model');
const residentialEmissionService = require('../../v1/population/services/residentialEmission.service');
const strawEmissionService = require('../../v1/straw/services/strawEmission.service');
const industryEmissionService = require("../../v1/industry/services/industrialEmission.service");
const areaSourceTrafficEmissionService = require("../../v1/traffic/services/areaSourceTrafficEmission.service");
const materialEmissionService = require("../../v1/material/services/materialEmission.service");
const { StrawWinterSpringHourlyEmissionFactorModel, StrawSummerAutumnHourlyEmissionFactorModel } = require("../../v1/straw/models/index.model");
const { AreaSourceTrafficWeekDaysHourlyEmissionFactorModel, AreaSourceTrafficWeekendHourlyEmissionFactorModel } = require("../../v1/traffic/models/index.model");
const { disconnect: mongoDisconnect } = require('mongoose');
const { disconnect: redisDisconnect } = require('../../v1/utils/redis');
const { join } = require("path");
const { PowerPlantEmissionFactorModel, PowerPlantActivityRateModel, PowerPlantFactoryModel } = require("../../v1/industry/models/index.model");

const YEAR = 2023;
const SUNDAY_SHIFT = 0;
const UTC_OFFSET = 7; // UTC+7 for Vietnam
const PROVINCE_IDS = [];
const RESOLUTION = 3;

const emissionFactorMap = new Map();
const activityRateMap = new Map();
async function getEmissionActivity() {
  const [activityRates, emissionFactors] = await Promise.all([
    PowerPlantActivityRateModel.find({ year: 2019 })
      .lean(),
    PowerPlantEmissionFactorModel.find({})
      .populate("powerPlantPollutantId", "name")
      .lean(),
  ]);
  for (const rate of activityRates) {
    activityRateMap.set(rate.factoryId.toString(), rate);
  }

  for (const factor of emissionFactors) {
    emissionFactorMap.set(factor.powerPlantPollutantId.name + factor.factoryId.toString(), factor);
  }
  console.log("Emission factors loaded:", emissionFactorMap);
  console.log("Activity rates loaded:", activityRateMap);
}

const specyFactorMap = new Map();
function readSpecyFactor() {
  const csvFilePath = path.join(__dirname, 'config/power-plan-specy-factor.csv');
  const csvData = fs.readFileSync(csvFilePath, 'utf8');
  const lines = csvData.trim().split('\n');
  for (const line of lines) {
    const [pollutantStr, specyStr, ratioStr] = line.split(',');
    const ratio = Number(ratioStr);
    if (!isNaN(ratio)) {
      specyFactorMap.set(specyStr, { ratio, pollutant: pollutantStr });
    }
  }
  console.log("Specy factors loaded:", specyFactorMap);
}

const factories = [];
async function getFactories() {
  const factoryDocs = await PowerPlantFactoryModel.find({}).sort({ indexCode: 1 }).lean();
  for (const doc of factoryDocs) {
    factories.push(doc);
  }
  console.log("Factories loaded:", factories);
}

const convertFactor = 1_000_000 / 3600; // convert t/h to g/s

const errorLog = new Map();
const log = (msg) => {
  if (!errorLog.has(msg)) {
    errorLog.set(msg, 1);
    console.error(msg);
  }
}

const cache = new Map();
function getSpecyValue(col, rowIdx, colIdx, hour, day) {
  if (cache.has(`${col}-${rowIdx}`)) {
    return cache.get(`${col}-${rowIdx}`);
  }
  const factory = factories[rowIdx];
  const factoryId = factory._id.toString();
  const specy = specyFactorMap.get(col);
  if (!specy) { console.error(`Unknown specy: ${col}`) }
  const emissionFactor = emissionFactorMap.get(specy.pollutant + factoryId);
  if (!emissionFactor) {
    log(`Unknown emission factor for factory ${factoryId} and specy ${specy.pollutant}`);
    return 0;
  }
  const activityRate = activityRateMap.get(factoryId);
  if (!activityRate) {
    log(`Unknown activity rate for factory ${factoryId} and specy ${specy.pollutant}`);
    return 0;
  }

  const emissionValue = emissionFactor.emissionFactorValue * activityRate.value; // ton / year
  const emissionValuePerHour = emissionValue / (365 * 24); // ton / hour
  const emissionValuePerSecond = emissionValuePerHour * convertFactor;

  const colEmission = emissionValuePerSecond * specy.ratio;
  cache.set(`${col}-${rowIdx}`, colEmission);

  return colEmission;
}

const headers = [];
const dimensionsArray = [];
const valuesArray = [];
function makeHeaders() {
  dimensionsArray.push(...["TSTEP", "YYYYDDD", "HHMMSS", "ROW", "COL"]);
  valuesArray.push(...Array.from(specyFactorMap.keys()));
  headers.push(...dimensionsArray, ...valuesArray);
}

async function writeCsvForDay(day, filePrefix, folder) {
  const dayStr = String(day).padStart(3, '0');
  const fileName = `${filePrefix}_${YEAR}${dayStr}.csv`;
  const outputDir = join(__dirname, "output", folder);
  const outputFile = join(outputDir, fileName);
  fs.mkdirSync(outputDir, { recursive: true });
  return new Promise(async (resolve, reject) => {
    const csvStream = fastcsv.format({
      headers,
      highWaterMark: 16 * 1024,
    });
    const writableStream = fs.createWriteStream(outputFile, {
      highWaterMark: 1 << 20 // ~1MB; tune for your disk
    });

    csvStream.pipe(writableStream).on('finish', () => {
      resolve(`CSV file for day ${dayStr} written to ${outputFile}`);
    });

    writableStream.on('error', reject);
    csvStream.on('error', reject);

    const YYYDDD = YEAR * 1000 + day;

    for (let tstep = 0; tstep < 25; tstep++) {
      for (let rowIdx = 0; rowIdx < factories.length; rowIdx++) {
        for (let colIdx = 0; colIdx <= 0; colIdx++) {
          const hour = tstep % 24;
          const rowObj = {
            TSTEP: 0,
            YYYYDDD: tstep >= 24 ? YYYDDD + 1 : YYYDDD,
            HHMMSS: hour * 10000,
            ROW: rowIdx,
            COL: colIdx
          };
          valuesArray.forEach(col => {
            rowObj[col] = getSpecyValue(col, rowIdx, colIdx, hour, day);
          });

          if (!csvStream.write(Object.values(rowObj))) {
            await new Promise(resolve => csvStream.once('drain', resolve));
          }
        }
      }
    }
    csvStream.end();
  });
}

async function test() {
  await getFactories();
}

async function main() {
  await getEmissionActivity();
  readSpecyFactor();
  await getFactories();
  makeHeaders();
  for (let day = 1; day <= 365; day++) {
    await writeCsvForDay(day, "power_plant", "power-plant");
    console.log(`Finished writing CSV for day ${day}`);
  }
}


if (require.main === module) {
  // main();
  test();
}

