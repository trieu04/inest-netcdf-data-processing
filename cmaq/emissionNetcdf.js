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
const { dimensionsArray, valuesArray, speciesToPollutant, convertFactor } = require('./constrains');
const { StrawWinterSpringHourlyEmissionFactorModel, StrawSummerAutumnHourlyEmissionFactorModel } = require("../../v1/straw/models/index.model");
const { AreaSourceTrafficWeekDaysHourlyEmissionFactorModel, AreaSourceTrafficWeekendHourlyEmissionFactorModel } = require("../../v1/traffic/models/index.model");
const { disconnect: mongoDisconnect } = require('mongoose');
const { disconnect: redisDisconnect } = require('../../v1/utils/redis');
const { join } = require("path");

const YEAR = 2023;
const SUNDAY_SHIFT = 0;
const UTC_OFFSET = 7; // UTC+7 for Vietnam
const PROVINCE_IDS = [];
const RESOLUTION = 3;
const START_HT_DAY = 121; // 01/05/2023
const END_HT_DAY = 181; // 30/06/2023
const START_DX_DAY = 244; // 01/09/2023
const END_DX_DAY = 304; // 31/10/2023

const cacheDir = path.join(__dirname, 'cache');
fs.mkdirSync(cacheDir, { recursive: true });
const outputDir = path.join(__dirname, 'output');
fs.mkdirSync(outputDir, { recursive: true });

const zeroMapObject = {
  BC: 0,
  CH4: 0,
  CO: 0,
  CO2: 0,
  N2O: 0,
  NH3: 0,
  NMVOC: 0,
  NOx: 0,
  OC: 0,
  PM10: 0,
  'PM2.5': 0,
  SO2: 0,
}

const emissionMapBoxResidentialMap = new Map();
const emissionMapBoxStrawDxMap = new Map();
const emissionMapBoxStrawHtMap = new Map();
const emissionMapBoxAreaSourceTrafficWeekdayMap = new Map();
const emissionMapBoxAreaSourceTrafficWeekendMap = new Map();
const emissionMapBoxIndustrySmallMap = new Map();
const emissionMapBoxIndustryLargeMap = new Map();
const emissionMapBoxPowerPlantMap = new Map();
const emissionMapBoxMaterialMap = new Map();

const dayFactorMap = new Map();
function readDayFactor(){
  const csvFilePath = path.join(__dirname, 'day-factor.csv');
  const csvData = fs.readFileSync(csvFilePath, 'utf8');
  const lines = csvData.trim().split('\n');
  for (const line of lines) {
    const [dayStr, factorStr] = line.split(',');
    const day = Number(dayStr);
    const factor = Number(factorStr);
    if (!isNaN(day) && !isNaN(factor)) {
      dayFactorMap.set(day, factor);
    }
  }
  console.log("Day factors loaded:", dayFactorMap);
}
readDayFactor();

async function loadOrCalculateEmissionSource(source, year, provinceIds, resolution) {
  const pollutants = ["BC", "CH4", "CO", "CO2", "N2O", "NH3", "NMVOC", "NOx", "OC", "PM10", "PM2.5", "SO2"];
  const cacheFile = path.join(cacheDir, `${source.name}_${year}_${resolution}.json`);
  const map = new Map();

  // Try load from cache
  if (fs.existsSync(cacheFile)) {
    console.log(`Loaded cache for ${source.name}`);
    const json = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    for (const [key, value] of Object.entries(json)) {
      map.set(key, value);
    }
    return map;
  }

  console.log(`Calculating emissions for ${source.name}...`);
  for (const pollutant of pollutants) {
    const result = await source.serviceCall(year, pollutant, provinceIds, resolution);
    const array = result.resultArray || result.emissionData;
    if (!array || !Array.isArray(array)) {
      throw new Error(`Invalid result format for ${source.name} with pollutant ${pollutant}`);
    }
    for (const item of array) {
      const key = `${item.row}:${item.col}`;
      if (!map.has(key)) {
        map.set(key, {
          row: item.row,
          col: item.col,
        });
      }
      map.get(key)[pollutant] = item.value;
    }
  }

  // Save to cache
  const jsonToSave = Object.fromEntries(map);
  fs.writeFileSync(cacheFile, JSON.stringify(jsonToSave), 'utf8');
  console.log(`Saved cache for ${source.name} → ${cacheFile}`);

  return map;
}

const isWeekend = (day) => {
  const m = (day + SUNDAY_SHIFT) % 7;
  // m = 1 : Sunday
  // m = 2 : Monday
  // m = 3 : Tuesday
  // m = 4 : Wednesday
  // m = 5 : Thursday
  // m = 6 : Friday
  // m = 0 : Saturday
  return m === 0 || m === 1;
}

const getSpecyValue = (specy, row, col, hour, day) => {
  const specyInfo = speciesToPollutant[specy];
  if (specyInfo) {
    let totalValue = 0;
    const pollutant = specyInfo.pollutant;
    const ratio = specyInfo.ratio ?? 1;
    const valueResidential = emissionMapBoxResidentialMap.get(`${row}:${col}:${hour}`)
    const valueStrawDx = emissionMapBoxStrawDxMap.get(`${row}:${col}:${hour}`)
    const valueStrawHt = emissionMapBoxStrawHtMap.get(`${row}:${col}:${hour}`)
    const valueAreaSourceTrafficWeekday = emissionMapBoxAreaSourceTrafficWeekdayMap.get(`${row}:${col}:${hour}`)
    const valueAreaSourceTrafficWeekend = emissionMapBoxAreaSourceTrafficWeekendMap.get(`${row}:${col}:${hour}`)
    const valueIndustrySmall = emissionMapBoxIndustrySmallMap.get(`${row}:${col}:${hour}`)
    const valueIndustryLarge = emissionMapBoxIndustryLargeMap.get(`${row}:${col}:${hour}`)
    const valuePowerPlant = emissionMapBoxPowerPlantMap.get(`${row}:${col}:${hour}`)
    const valueMaterial = emissionMapBoxMaterialMap.get(`${row}:${col}:${hour}`)

    if (valueResidential) {
      totalValue += valueResidential[pollutant] ?? 0;
    }

    if (valueStrawDx && day >= START_DX_DAY && day <= END_DX_DAY) {
      totalValue += valueStrawDx[pollutant] ?? 0;
    }

    if (valueStrawHt && day >= START_HT_DAY && day <= END_HT_DAY) {
      totalValue += valueStrawHt[pollutant] ?? 0;
    }

    if (isWeekend(day)) {
      if (valueAreaSourceTrafficWeekend) {
        totalValue += valueAreaSourceTrafficWeekend[pollutant] ?? 0;
      }
    } else {
      if (valueAreaSourceTrafficWeekday) {
        totalValue += valueAreaSourceTrafficWeekday[pollutant] ?? 0;
      }
    }

    if (valueIndustrySmall) {
      totalValue += valueIndustrySmall[pollutant] ?? 0;
    }

    if (valueIndustryLarge) {
      totalValue += valueIndustryLarge[pollutant] ?? 0;
    }

    if (valuePowerPlant) {
      totalValue += valuePowerPlant[pollutant] ?? 0;
    }

    if (valueMaterial) {
      totalValue += valueMaterial[pollutant] ?? 0;
    }

    const dayFactor = dayFactorMap.get(day) ?? 1;

    return convertFactor * totalValue * ratio * dayFactor;
  }
  return 0; // Default to 0 if species not found
}

async function residential() {
  const residentialMapData = await loadOrCalculateEmissionSource(
    {
      name: 'residential',
      serviceCall: (year, pollutant, provinceIds, resolution) => residentialEmissionService.calculateWardResidentialMapboxEmission(year, pollutant, provinceIds, resolution),
    },
    YEAR, PROVINCE_IDS, RESOLUTION
  );
  const factors = await ResidentialHourlyEmissionFactorModel.find({});
  const hourlyFactorsMap = new Map();
  for (const factor of factors) {
    const hour = parseInt(factor.hour.split(':')[0], 10);
    const utcHour = (24 + hour - UTC_OFFSET) % 24;
    hourlyFactorsMap.set(utcHour, factor.value);
  }

  for (const value of residentialMapData.values()) {
    const { row, col, ...pollutantValues } = value;
    for (let hour = 0; hour < 24; hour++) {
      let obj = emissionMapBoxResidentialMap.get(`${row}:${col}:${hour}`);
      if (!obj) {
        obj = { ...zeroMapObject };
        emissionMapBoxResidentialMap.set(`${row}:${col}:${hour}`, obj);
      }
      Object.keys(pollutantValues).forEach(pollutant => {
        const valueYear = pollutantValues[pollutant]; // t/year
        const valueDay = valueYear / 365; // t/day
        const factor = hourlyFactorsMap.get(hour);
        const valueHour = valueDay * factor; // t/hour
        obj[pollutant] += valueHour;
      });
    }
  }
}

async function strawDx() {
  const strawDxMapData = await loadOrCalculateEmissionSource(
    {
      name: 'strawDx',
      serviceCall: (year, pollutant, provinceIds, resolution) => strawEmissionService.calculateProvinceStrawMapboxEmission(year, pollutant, provinceIds, resolution, "66666e1d69a07e96ce749775"),
    },
    YEAR, PROVINCE_IDS, RESOLUTION
  );
  const factors = await StrawWinterSpringHourlyEmissionFactorModel.find({});
  const hourlyFactorsMap = new Map();
  for (const factor of factors) {
    const hour = parseInt(factor.hour.split(':')[0], 10);
    const utcHour = (24 + hour - UTC_OFFSET) % 24;
    hourlyFactorsMap.set(utcHour, factor.value);
  }
  const dxDays = END_DX_DAY - START_DX_DAY + 1;
  for (const value of strawDxMapData.values()) {
    const { row, col, ...pollutantValues } = value;
    for (let hour = 0; hour < 24; hour++) {
      let obj = emissionMapBoxStrawDxMap.get(`${row}:${col}:${hour}`);
      if (!obj) {
        obj = { ...zeroMapObject };
        emissionMapBoxStrawDxMap.set(`${row}:${col}:${hour}`, obj);
      }
      Object.keys(pollutantValues).forEach(pollutant => {
        const valueAll = pollutantValues[pollutant]; // t/year
        const valueDay = valueAll / dxDays; // t/day
        const factor = hourlyFactorsMap.get(hour) || (1 / 24);
        const valueHour = valueDay * factor; // t/hour
        obj[pollutant] += valueHour;
      });
    }
  }
}

async function strawHt() {
  const strawHtMapData = await loadOrCalculateEmissionSource(
    {
      name: 'strawHt',
      serviceCall: (year, pollutant, provinceIds, resolution) => strawEmissionService.calculateProvinceStrawMapboxEmission(year, pollutant, provinceIds, resolution, "66666e2569a07e96ce749778"),
    },
    YEAR, PROVINCE_IDS, RESOLUTION
  );
  const factors = await StrawSummerAutumnHourlyEmissionFactorModel.find({});
  const factorsMap = new Map();
  for (const factor of factors) {
    const hour = parseInt(factor.hour.split(':')[0], 10);
    const utcHour = (24 + hour - UTC_OFFSET) % 24;
    factorsMap.set(utcHour, factor.value);
  }
  const htDays = END_HT_DAY - START_HT_DAY + 1;
  for (const value of strawHtMapData.values()) {
    const { row, col, ...pollutantValues } = value;
    for (let hour = 0; hour < 24; hour++) {
      let obj = emissionMapBoxStrawHtMap.get(`${row}:${col}:${hour}`);
      if (!obj) {
        obj = { ...zeroMapObject };
        emissionMapBoxStrawHtMap.set(`${row}:${col}:${hour}`, obj);
      }
      Object.keys(pollutantValues).forEach(pollutant => {
        const valueAll = pollutantValues[pollutant]; // t/year
        const valueDay = valueAll / htDays; // t/day
        const factor = factorsMap.get(hour) || (1 / 24);
        const valueHour = valueDay * factor; // t/hour
        obj[pollutant] += valueHour;
      });
    }
  }
}

async function areaSourceTraffic() {
  const trafficMapData = await loadOrCalculateEmissionSource(
    {
      name: 'traffic',
      serviceCall: (year, pollutant, provinceIds, resolution) =>
        areaSourceTrafficEmissionService.calculateAreaSourceTrafficMapboxEmission(year, pollutant, provinceIds, resolution),
    },
    YEAR, PROVINCE_IDS, RESOLUTION
  );
  const factorsWeekday = await AreaSourceTrafficWeekDaysHourlyEmissionFactorModel.find({}).populate('pollutantId');
  const factorsWeekend = await AreaSourceTrafficWeekendHourlyEmissionFactorModel.find({}).populate('pollutantId');
  const factorsWeekdayMap = new Map();
  for (const factor of factorsWeekday) {
    const hour = parseInt(factor.hour.split(':')[0], 10);
    const pollutantName = factor.pollutantId.name;
    factorsWeekdayMap.set(`${hour}:${pollutantName}`, factor.value);
  }
  const factorsWeekendMap = new Map();
  for (const factor of factorsWeekend) {
    const hour = parseInt(factor.hour.split(':')[0], 10);
    const utcHour = (24 + hour - UTC_OFFSET) % 24;
    const pollutantName = factor.pollutantId.name;
    factorsWeekendMap.set(`${utcHour}:${pollutantName}`, factor.value);
  }

  for (const value of trafficMapData.values()) {
    const { row, col, ...pollutantValues } = value;
    for (let hour = 0; hour < 24; hour++) {
      let objWeekday = emissionMapBoxAreaSourceTrafficWeekdayMap.get(`${row}:${col}:${hour}`);
      if (!objWeekday) {
        objWeekday = { ...zeroMapObject };
        emissionMapBoxAreaSourceTrafficWeekdayMap.set(`${row}:${col}:${hour}`, objWeekday);
      }
      let objWeekend = emissionMapBoxAreaSourceTrafficWeekendMap.get(`${row}:${col}:${hour}`);
      if (!objWeekend) {
        objWeekend = { ...zeroMapObject };
        emissionMapBoxAreaSourceTrafficWeekendMap.set(`${row}:${col}:${hour}`, objWeekend);
      }

      Object.keys(pollutantValues).forEach(pollutant => {
        const valueYear = pollutantValues[pollutant]; // t/year
        const valueDay = valueYear / 365; // t/day
        const factorWeekday = factorsWeekdayMap.get(`${hour}:${pollutant}`) || (1 / 24);
        const valueHourWeekday = valueDay * factorWeekday; // t/hour
        objWeekday[pollutant] += valueHourWeekday;
        const factorWeekend = factorsWeekendMap.get(`${hour}:${pollutant}`) || (1 / 24);
        const valueHourWeekend = valueDay * factorWeekend; // t/hour
        objWeekend[pollutant] += valueHourWeekend;
      });
    }
  }
}

async function industrySmall() {
  const industrySmallMapData = await loadOrCalculateEmissionSource(
    {
      name: 'industry_small',
      serviceCall: (year, pollutant, provinceIds, resolution) => industryEmissionService.calculateAreaSourceSmallIndustryMapboxEmission({ year: 2019, industryPollutantName: pollutant, provinceIds, resolution }),
    },
    YEAR, PROVINCE_IDS, RESOLUTION,
  )

  for (const value of industrySmallMapData.values()) {
    const { row, col, ...pollutantValues } = value;
    for (let hour = 0; hour < 24; hour++) {
      let obj = emissionMapBoxIndustrySmallMap.get(`${row}:${col}:${hour}`);
      if (!obj) {
        obj = { ...zeroMapObject };
        emissionMapBoxIndustrySmallMap.set(`${row}:${col}:${hour}`, obj);
      }
      Object.keys(pollutantValues).forEach(pollutant => {
        const valueYear = pollutantValues[pollutant];
        const valueDay = valueYear / 365; // t/day
        const valueHour = valueDay / 24; // t/hour
        obj[pollutant] += valueHour;
      });
    }
  }
}

async function industryLarge() {
  // # NOTE: 99.31% exactly
  const industryLargeMapData = await loadOrCalculateEmissionSource(
    {
      name: 'industry_large',
      serviceCall: (year, pollutant, provinceIds, resolution) => industryEmissionService.calculatePointSourceLargeIndustrialMapboxEmission({ year: 2019, industryPollutantName: pollutant, provinceIds, resolution }),
    },
    YEAR, PROVINCE_IDS, RESOLUTION
  );

  for (const value of industryLargeMapData.values()) {
    const { row, col, ...pollutantValues } = value;
    for (let hour = 0; hour < 24; hour++) {
      let obj = emissionMapBoxIndustryLargeMap.get(`${row}:${col}:${hour}`);
      if (!obj) {
        obj = { ...zeroMapObject };
        emissionMapBoxIndustryLargeMap.set(`${row}:${col}:${hour}`, obj);
      }
      Object.keys(pollutantValues).forEach(pollutant => {
        const valueYear = pollutantValues[pollutant]; // t/year
        const valueDay = valueYear / 365; // t/day
        const valueHour = valueDay / 24; // t/hour
        obj[pollutant] += valueHour;
      });
    }
  }
}

async function powerPlant() {
  const powerPlantMapData = await loadOrCalculateEmissionSource(
    {
      name: 'power_plant',
      serviceCall: (year, pollutant, provinceIds, resolution) => industryEmissionService.calculatePointSourcePowerPlantMapboxEmission({ year: 2019, powerPlantPollutantName: pollutant, provinceIds, resolution }),
    },
    YEAR, PROVINCE_IDS, RESOLUTION
  );

  for (const value of powerPlantMapData.values()) {
    const { row, col, ...pollutantValues } = value;
    for (let hour = 0; hour < 24; hour++) {
      let obj = emissionMapBoxPowerPlantMap.get(`${row}:${col}:${hour}`);
      if (!obj) {
        obj = { ...zeroMapObject };
        emissionMapBoxPowerPlantMap.set(`${row}:${col}:${hour}`, obj);
      }
      Object.keys(pollutantValues).forEach(pollutant => {
        const valueYear = pollutantValues[pollutant];
        const valueDay = valueYear / 365; // t/day
        const valueHour = valueDay / 24; // t/hour
        obj[pollutant] += valueHour;
      });
    }
  }
}

async function material() {
  const materialMapData = await loadOrCalculateEmissionSource(
    {
      name: 'material',
      serviceCall: (year, pollutant, provinceIds, resolution) =>
        materialEmissionService.calculateMaterialMapboxEmissionV2(year, pollutant, provinceIds, resolution),
    },
    YEAR, PROVINCE_IDS, RESOLUTION
  );

  for (const value of materialMapData.values()) {
    const { row, col, ...pollutantValues } = value;
    for (let hour = 0; hour < 24; hour++) {
      let obj = emissionMapBoxMaterialMap.get(`${row}:${col}:${hour}`);
      if (!obj) {
        obj = { ...zeroMapObject };
        emissionMapBoxMaterialMap.set(`${row}:${col}:${hour}`, obj);
      }
      Object.keys(pollutantValues).forEach(pollutant => {
        const valueYear = pollutantValues[pollutant];
        const valueDay = valueYear / 365; // t/day
        const valueHour = valueDay / 24; // t/hour
        obj[pollutant] += valueHour;
      });
    }
  }
}

const headers = [
  ...dimensionsArray,
  ...valuesArray,
];

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
      for (let rowIdx = 0; rowIdx <= 78; rowIdx++) {
        for (let colIdx = 0; colIdx <= 126; colIdx++) {
          const hour = tstep % 24;
          const rowObj = {
            TSTEP: tstep,
            YYYYDDD: tstep >= 24 ? YYYDDD + 1 : YYYDDD,
            HHMMSS: hour * 10000,
            ROW: rowIdx,
            COL: colIdx
          };
          valuesArray.forEach(col => {
            rowObj[col] = getSpecyValue(col, rowIdx, colIdx, hour, day);
          });

          if (!csvStream.write(Object.values(rowObj))) {
            // await new Promise(resolve => csvStream.once('drain', resolve));
          }
        }
      }
    }
    csvStream.end();
  });
}

module.exports = {
  emissionMapBoxResidentialMap,
  emissionMapBoxStrawDxMap,
  emissionMapBoxStrawHtMap,
  emissionMapBoxAreaSourceTrafficWeekdayMap,
  emissionMapBoxAreaSourceTrafficWeekendMap,
  emissionMapBoxIndustrySmallMap,
  emissionMapBoxIndustryLargeMap,
  emissionMapBoxPowerPlantMap,
  emissionMapBoxMaterialMap,
  zeroMapObject,
  convertFactor,
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
};
