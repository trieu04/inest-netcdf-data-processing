const xlsx = require('xlsx');
const fs = require('fs');
const fastcsv = require('fast-csv');
const { join } = require("path");

const NROWS = 79;
const NCOLS = 127;
const DATA_FOLDER = join(__dirname, '../data/gfed4/json2');
// CAMS-GLOB-ANT_Glb_0.1x0.1_anthro_{}_v5.3_yearly_2023.json
// CAMS-GLOB-ANT_Glb_0.1x0.1_anthro_{}_v5.3_yearly_2023.json;
// FINN_Glb_0.1x0.1_bb_{}__yearly_2019.json
// GFED4_Glb_0.25x0.25_bb_{}__daily_2022.json
const FILE_PATTERN = 'GFED4_Glb_0.25x0.25_bb_{}__daily_2022.json';
const POLLUTANT_SPECIES_MAPPING_FILE = join(__dirname, 'config/mapping_pollutant_to_cmaq_species_GFED4.csv');
const MAP_FACTOR_FILE = join(__dirname, 'resources/hanoi-percentages-2.json');
const OUTPUT_DIR = join(__dirname, '../output');
const FILE_PREFIX = 'gfed4-hanoi'
const OUTPUT_FOLDER = 'gfed4-hanoi';

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
    const message = await writeCsvForDay(day, FILE_PREFIX, OUTPUT_FOLDER);
    console.log(`${message} (${day - startDay + 1}/${endDay - startDay + 1})`);
  }
}

// Load the Excel config file
const workbook = xlsx.readFile(POLLUTANT_SPECIES_MAPPING_FILE);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const pollutantSpecies = xlsx.utils.sheet_to_json(sheet, {
  header: ['pollutant', 'species', 'ratio'],
  range: 1 // skip header row
});

console.log("pollutantSpecies", pollutantSpecies);

const speciesList = [
  ...new Set(pollutantSpecies.map(item => item.species))
];

const pollutantList = [
  ...new Set(pollutantSpecies.map(item => item.pollutant))
];

const speciesValues = {
  ...Object.fromEntries(speciesList.map(species => [species, 0]))
};

const map = new Map(); // key col:row, value is speciesValues

const day2DateMap = new Map(); // key day, value is map
function loadDay2DateMap() {
  for (let day = 1; day <= 365; day++) {
    const date = new Date(2022, 0); // January 1, 2022
    date.setDate(day);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(date.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${dayOfMonth}`;
    day2DateMap.set(day, formattedDate);
  }
}
loadDay2DateMap();

const cellFactorMap = new Map();
function loadCellFactor() {
  const entries = JSON.parse(fs.readFileSync(MAP_FACTOR_FILE, 'utf8'));
  if (!Array.isArray(entries)) {
    throw new Error(`Invalid data format in ${MAP_FACTOR_FILE}`);
  }
  for (const { row, col, percentage } of entries) {
    const key = `${row}:${col}`;
    cellFactorMap.set(key, 1 - percentage / 100);
  }
};
loadCellFactor();

const stats = { total: 0, success: 0, error: 0 };
for (const pollutant of pollutantList) {
  const fileName = join(DATA_FOLDER, FILE_PATTERN.replace('{}', pollutant));
  stats.total++;

  try {
    // Check if file exists
    if (fs.existsSync(fileName)) {
      console.log(`Processing file: ${fileName}`);
      // Read the JSON file
      const jsonData = fs.readFileSync(fileName, 'utf8');
      const data = JSON.parse(jsonData);

      const fields = pollutantSpecies.filter(p => p.pollutant === pollutant);
      if (fields.length === 0) {
        console.warn(`No mapping found for pollutant ${pollutant}`);
        continue;
      }

      for (const entry of data) {
        const { col, row, time, value } = entry;
        const key = `${row}:${col}:${time}`;
        if (!map.has(key)) {
          map.set(key, { ...speciesValues });
        }

        if (value === undefined || value === null) {
          console.warn(`Missing sum for entry at lon: ${lon}, lat: ${lat}`);
          continue;
        }

        const speciesValue = map.get(key);

        for (const field of fields) {
          const { species, ratio } = field;
          if (speciesValue.hasOwnProperty(species)) {
            speciesValue[species] += value * ratio;
          } else {
            console.warn(`Species ${species} not found in speciesValues`);
          }
        }
      }

      stats.success++;
      // You can process the data here
      // Example: console.log(data);

    } else {
      console.log(`File not found: ${fileName}`);
    }
  } catch (error) {
    console.error(`Error reading ${pollutant} file:`, error.message);
  }
}

console.log(`Total files processed: ${stats.total}`);
console.log(`Successfully processed files: ${stats.success}`);

const factor = 1_000_000 * 1_000_000 / 24 / 3600;

for (const [key, value] of map.entries()) {
  const [row, col] = key.split(':');
  const cellFactor = cellFactorMap.get(`${row}:${col}`) ?? 1;
  for (const species of speciesList) {
    value[species] = value[species] * factor * cellFactor;
  }
}


const YEAR = 2023;
const headers = [
  'TSTEP', 'YYYYDDD', 'HHMMSS', 'ROW', 'COL',
  ...speciesList,
];

function getSpeciesValues(rowIdx, colIdx, day) {
  const time = day2DateMap.get(day);
  const data = map.get(`${rowIdx}:${colIdx}:${time}`);
  if (!data) {
    console.warn(`No data for ${rowIdx},${colIdx} on day ${day} (${time})`);
  }
  return data;
}


async function writeCsvForDay(day, filePrefix, folder) {
  const dayStr = String(day).padStart(3, '0');
  const fileName = `${filePrefix}_${YEAR}${dayStr}.csv`;
  const folderPath = join(OUTPUT_DIR, folder)
  const outputFile = join(folderPath, fileName);
  fs.mkdirSync(folderPath, { recursive: true });
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
          const speciesValues = getSpeciesValues(rowIdx, colIdx, day);

          const rowObj = {
            TSTEP: tstep,
            YYYYDDD: tstep >= 24 ? YYYDDD + 1 : YYYDDD,
            HHMMSS: hour * 10000,
            ROW: rowIdx,
            COL: colIdx,
            ...speciesValues,
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
  main();
}
