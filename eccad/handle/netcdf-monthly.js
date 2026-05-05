const xlsx = require('xlsx');
const fs = require('fs');
const fastcsv = require('fast-csv');
const { join } = require("path");
var format = require("string-template");

// Configuration
const CONFIG = {
  NROWS: 79,
  NCOLS: 127,
  YEAR: 2023,
  DATA_FOLDER: join(__dirname, '../data/ant2/json'),
  FILE_PATTERN: 'CAMS-GLOB-ANT_Glb_0.1x0.1_anthro_{pollutant}_v5.3_monthly_2023.json',
  POLLUTANT_MAPPING_FILE: join(__dirname, 'config/mapping_pollutant_to_cmaq_species_ANT.csv'),
  MAP_FACTOR_FILE: join(__dirname, 'resources/7-percentages-2.json'),
  OUTPUT_DIR: join(__dirname, '../output'),
  FILE_PREFIX: 'ant2-7tinh',
  OUTPUT_FOLDER: 'ant2-7tinh',
  CELL_FACTOR: 1 / (24 * 3600),
  EXCLUDE_HANOI: true,
};

// Global state
let startDay = null, endDay = null, verbose = false;
const dataMap = new Map();
const dateMap = new Map();
const excludeHanoiFactorMap = new Map();
let speciesList = [], pollutantSpecies = [];

const daysMap = {
  '01': 31, '02': 28, '03': 31, '04': 30, '05': 31, '06': 30,
  '07': 31, '08': 31, '09': 30, '10': 31, '11': 30, '12': 31,
};

// Utility functions
const log = (...args) => verbose && console.log(...args);
const createDateString = (day) => {
  let dateStr = dateMap.get(day);
  if (dateStr) return dateStr;
  const date = new Date(CONFIG.YEAR, 0, day, 7); // Set hour to 7 to avoid timezone issues
  dateStr = date.toISOString().split('T')[0];
  dateMap.set(day, dateStr);
  return dateStr;
};

// Initialize data maps
function initialize() {
  // Load pollutant species mapping
  const workbook = xlsx.readFile(CONFIG.POLLUTANT_MAPPING_FILE);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  pollutantSpecies = xlsx.utils.sheet_to_json(sheet, {
    header: ['pollutant', 'species', 'ratio'],
    range: 1,
  });

  speciesList = [...new Set(pollutantSpecies.map(item => item.species))];
  log("Species list:", speciesList);

  // Load cell factors
  const entries = JSON.parse(fs.readFileSync(CONFIG.MAP_FACTOR_FILE, 'utf8'));
  entries.forEach(({ row, col, percentage }) => {
    excludeHanoiFactorMap.set(`${row}:${col}`, 1 - percentage / 100);
  });
}

// Process pollutant data
function processData(fileParam = {}) {
  const pollutantList = [...new Set(pollutantSpecies.map(item => item.pollutant))];
  const stats = { total: 0, success: 0, error: 0, failedList: [] };

  for (let pollutant of pollutantList) {
    fileParam = {
      ...fileParam,
      pollutant: pollutant,
    };
    const fileName = join(CONFIG.DATA_FOLDER, format(CONFIG.FILE_PATTERN, fileParam));
    stats.total++;

    try {
      if (!fs.existsSync(fileName)) {
        console.warn(`File not found: ${fileName}`);
        stats.error++;
        stats.failedList.push(fileName);
        continue;
      }

      const data = JSON.parse(fs.readFileSync(fileName, 'utf8'));
      const fields = pollutantSpecies.filter(p => p.pollutant === pollutant);

      data.forEach(({ col, row, time, value }) => {
        if (value == null) return;

        const key = `${row}:${col}:${time}`;
        if (!dataMap.has(key)) {
          dataMap.set(key, Object.fromEntries(speciesList.map(s => [s, 0])));
        }

        const speciesValue = dataMap.get(key);
        fields.forEach(({ species, ratio }) => {
          if (speciesValue[species] !== undefined) {
            speciesValue[species] += value * ratio;
          }
        });
      });

      stats.success++;
      log(`Processed: ${fileName}`);
    } catch (error) {
      console.error(`Error processing ${fileName}:`, fileParam, error);
      stats.error++;
      stats.failedList.push(fileName);
      continue;
    }
  }

  console.log(`Files processed: ${stats.success}/${stats.total} (${stats.error} errors)`);
  console.log("failed files:", stats.failedList);

  // Apply conversion factors
  const getExcludeHanoiFactor = (key) => {
    if (!CONFIG.EXCLUDE_HANOI) return 1;
    const [row, col] = key.split(':');
    return excludeHanoiFactorMap.get(`${row}:${col}`) ?? 1;
  };
  dataMap.forEach((value, key) => {
    const excludeHanoiFactor = getExcludeHanoiFactor(key);
    speciesList.forEach(species => {
      value[species] *= CONFIG.CELL_FACTOR * excludeHanoiFactor;
    });
  });
  // dataMap là một lưới, mỗi key là "row:col:time", value là object {species1: val1, species2: val2, ...}
  // đơn vị: g/month
}

async function writeCsvForDay(day, filePrefix, folder) {
  const dayStr = String(day).padStart(3, '0');
  const fileName = `${filePrefix}_${CONFIG.YEAR}${dayStr}.csv`;
  const folderPath = join(CONFIG.OUTPUT_DIR, folder);
  const outputFile = join(folderPath, fileName);

  fs.mkdirSync(folderPath, { recursive: true });

  return new Promise((resolve, reject) => {
    const headers = ['TSTEP', 'YYYYDDD', 'HHMMSS', 'ROW', 'COL', ...speciesList];
    const csvStream = fastcsv.format({ headers, highWaterMark: 16 * 1024 });
    const writableStream = fs.createWriteStream(outputFile, { highWaterMark: 1 << 20 });

    csvStream.pipe(writableStream).on('finish', () => {
      resolve(`CSV file for day ${dayStr} written to ${outputFile}`);
    });

    writableStream.on('error', reject);
    csvStream.on('error', reject);

    const YYYDDD = CONFIG.YEAR * 1000 + day;

    (async () => {
      for (let tstep = 0; tstep < 25; tstep++) {
        for (let rowIdx = 0; rowIdx < CONFIG.NROWS; rowIdx++) {
          for (let colIdx = 0; colIdx < CONFIG.NCOLS; colIdx++) {
            const hour = tstep % 24;
            const dateStr = createDateString(day);
            const month = dateStr.substring(5, 7);
            const daysOfMonth = daysMap[month];
            const timeMonth = dateStr.substring(0, 7) + '-01';

            const data = dataMap.get(`${rowIdx}:${colIdx}:${timeMonth}`);
            if (!data) {
              console.warn(`No data for ${rowIdx},${colIdx} on day ${day}`);
            }

            const rowObj = {
              TSTEP: tstep,
              YYYYDDD: tstep >= 24 ? YYYDDD + 1 : YYYDDD,
              HHMMSS: hour * 10000,
              ROW: rowIdx,
              COL: colIdx,
            };

            for (let species of speciesList) {
              rowObj[species] = (data?.[species] ?? 0) / daysOfMonth;
            }

            if (!csvStream.write(Object.values(rowObj))) {
              await new Promise(resolve => csvStream.once('drain', resolve));
            }
          }
        }
      }
      csvStream.end();
    })();
  });
}

async function main() {
  const args = process.argv.slice(2);

  args.forEach(arg => {
    if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (!isNaN(arg)) {
      if (startDay === null) startDay = parseInt(arg, 10);
      else if (endDay === null) endDay = parseInt(arg, 10);
    }
  });

  if (startDay === null || endDay === null || startDay > endDay) {
    console.error("Usage: node script.js <startDay> <endDay> [--verbose|-v]");
    process.exit(1);
  }

  log('Verbose mode enabled');

  initialize();
  processData();

  for (let day = startDay; day <= endDay; day++) {
    const message = await writeCsvForDay(day, CONFIG.FILE_PREFIX, CONFIG.OUTPUT_FOLDER);
    console.log(`${message} (${day - startDay + 1}/${endDay - startDay + 1})`);
  }
}

exports.writeCsvForDay = writeCsvForDay;

if (require.main === module) {
  main();
}
