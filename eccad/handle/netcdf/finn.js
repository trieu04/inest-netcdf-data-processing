const fs = require('fs');
const path = require('path');
const fastcsv = require('fast-csv');
const { join } = require("path");

const NROWS = 118;
const NCOLS = 139;

const pollutantMappings = [
  { pollutant: "BC", species: "PEC", ratio: 1.0 },
  { pollutant: "CH4", species: "CH4", ratio: 1.0 },
  { pollutant: "CO", species: "CO", ratio: 1.0 },
  { pollutant: "NO", species: "NO", ratio: 0.9 },
  { pollutant: "NO", species: "NO2", ratio: 0.1 },
  { pollutant: "OC", species: "POC", ratio: 1.0 },
];


const speciesList = [
  ...new Set([
    "PEC",
    "CH4",
    "CO",
    "NO",
    "NO2",
    "POC"
  ])
];


const pollutantList = [
  ...new Set([
    "BC",
    "CH4",
    "CO",
    "NO",
    "OC"
  ])
];

const speciesValues = {
  PEC: 0,
  CH4: 0,
  CO: 0,
  NO: 0,
  NO2: 0,
  POC: 0
};

const map = new Map(); // key col:row, value is speciesValues
for (let row = 0; row < NROWS; row++) {
  for (let col = 0; col < NCOLS; col++) {
    const key = `${row}:${col}`;
    map.set(key, { ...speciesValues });
  }
}

const jsonFolder = '~/inest/eccad/finn-total/json';
const getFileName = (pollutant) => {
  return `${jsonFolder}/FINN_Glb_0.1x0.1_bb_${pollutant}__yearly_2019.json`;
};

const stats = {total: 0, success: 0, error: 0};

for (const pollutant of pollutantList) {
  const fileName = getFileName(pollutant);
  stats.total++;

  try {
    // Expand the ~ to the actual home directory
    const expandedPath = fileName.replace('~', process.env.HOME || require('os').homedir());

    // Check if file exists
    if (fs.existsSync(expandedPath)) {
      // Read the JSON file
      const jsonData = fs.readFileSync(expandedPath, 'utf8');
      const data = JSON.parse(jsonData);

      const fields = pollutantMappings.filter(p => p.pollutant === pollutant);
      if (fields.length === 0) {
        console.warn(`No mapping found for pollutant ${pollutant}`);
        continue;
      }

      for (const entry of data) {
        const { lon, lat, emiss_bb: sum } = entry;
        const col = Math.round((lon - 99.05) / 0.1);
        const row = Math.round((lat - 15.05) / 0.1);
        const key = `${row}:${col}`;
        const speciesValue = map.get(key);
        if (!speciesValue) {
          console.warn(`No data for key ${key}`);
          continue;
        }

        if (sum === undefined || sum === null) {
          console.warn(`Missing sum for entry at lon: ${lon}, lat: ${lat}`);
          continue;
        }

        for (const field of fields) {
          const { species, ratio } = field;
          if (speciesValue.hasOwnProperty(species)) {
            speciesValue[species] += sum * ratio;
          } else {
            console.warn(`Species ${species} not found in speciesValues`);
          }
        }
      }

      console.log(`Successfully read ${pollutant} data:`);
      stats.success++;
      // You can process the data here
      // Example: console.log(data);

    } else {
      console.log(`File not found: ${expandedPath}`);
    }
  } catch (error) {
    console.error(`Error reading ${pollutant} file:`, error.message);
  }
}

console.log(`Total files processed: ${stats.total}`);
console.log(`Successfully processed files: ${stats.success}`);

const factor = 1_000_000 * 1_000_000 / 365 / 24 / 3600;
const convertedMap = new Map();
for (const [key, value] of map.entries()) {
  const newValue = {};
  for (const species of speciesList) {
    newValue[species] = value[species] * factor;
  }
  convertedMap.set(key, newValue);
}

const YEAR = 2023;
const headers = [
  'TSTEP', 'YYYYDDD', 'HHMMSS', 'ROW', 'COL',
  ...speciesList,
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
      for (let rowIdx = 0; rowIdx < NROWS; rowIdx++) {
        for (let colIdx = 0; colIdx < NCOLS; colIdx++) {
          const hour = tstep % 24;
          const speciesValue = convertedMap.get(`${rowIdx}:${colIdx}`);
          const rowObj = {
            TSTEP: tstep,
            YYYYDDD: tstep >= 24 ? YYYDDD + 1 : YYYDDD,
            HHMMSS: hour * 10000,
            ROW: rowIdx,
            COL: colIdx,
            ...speciesValue,
          };


          if (!csvStream.write(Object.values(rowObj))) {
            await new Promise(resolve => csvStream.once('drain', resolve));
          }
        }
      }
    }
    csvStream.end();
  });
}

exports.writeCsvForDay = writeCsvForDay;

if (require.main === module) {
  writeCsvForDay(1, 'finn', 'test');
}
