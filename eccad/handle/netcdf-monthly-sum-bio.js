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
  DATA_FOLDER: join(__dirname, '../data/bio2/json'),
  FILE_PATTERN: 'CAMS-GLOB-BIO_Glb_0.25x0.25_bio_{pollutant}_v3.1_monthly_2023.json',
  POLLUTANT_MAPPING_FILE: join(__dirname, 'config/mapping_pollutant_to_cmaq_species_BIO.csv'),
  POLLUTANTS: ['CO'],
};

// Global state
let startDay = null, endDay = null, verbose = false;
const pollutantGridMap = new Map();
let speciesList = [], pollutantSpecies = [];
const pollutantList = CONFIG.POLLUTANTS;

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
  console.log("Species list:", speciesList);
}

// Process pollutant data

function processData(fileParam = {}) {
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
      data.forEach(({ col, row, time, value }) => {
        if (value == null) return;

        const key = `${row}:${col}:${time}`;
        if (!pollutantGridMap.has(key)) {
          // > Object.fromEntries(['a', 'b'].map(p => [p, 0]))
          // { a: 0, b: 0 }
          pollutantGridMap.set(key, Object.fromEntries(pollutantList.map(p => [p, 0])));
        }

        const entry = pollutantGridMap.get(key);
        entry[pollutant] += value;
      });

      stats.success++;
      console.log(`Processed: ${fileName}`);
    } catch (error) {
      console.error(`Error processing ${fileName}:`, fileParam, error);
      stats.error++;
      stats.failedList.push(fileName);
      continue;
    }
  }

  console.log(`Files processed: ${stats.success}/${stats.total} (${stats.error} errors)`);
  console.log("failed files:", stats.failedList);
}

function sumByProvince(provinceFileName) {
  const provinceMap = new Map();
  const entries = JSON.parse(fs.readFileSync(provinceFileName, 'utf8'));
  entries.forEach(({ row, col, percentage }) => {
    provinceMap.set(`${row}:${col}`, percentage / 100);
  });

  const sum = Object.fromEntries(pollutantList.map(p => [p, 0]));
  for (let month = 1; month < 12; month++) {
    for (let rowIdx = 0; rowIdx < CONFIG.NROWS; rowIdx++) {
      for (let colIdx = 0; colIdx < CONFIG.NCOLS; colIdx++) {
        const timeMonth = `2023-${month.toString().padStart(2, '0')}-01`; // need fix
        const cellData = pollutantGridMap.get(`${rowIdx}:${colIdx}:${timeMonth}`);
        const cellPercent = provinceMap.get(`${rowIdx}:${colIdx}`);
        if (cellPercent && cellPercent !== 0) {
          for (const key in sum) {
            sum[key] += cellData[key] * cellPercent;
          }
        }
      }
    }
  }

  return sum;
}

if (require.main === module) {
  initialize();
  processData();
  const out = [];
  const provinces = ["Hà Nội", "Bắc Ninh", "Hải Dương", "Hải Phòng", "Hưng Yên", "Quảng Ninh", "Vĩnh Phúc"];
  for (const province of provinces) {
    const fileName = `resources/${province.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/\s+/g, "")}-percentages-2.json`;
    console.log(fileName);
    const sum = sumByProvince(fileName);
    out.push({
      province,
      ...sum,
    })
  }
  console.log(out);
}
