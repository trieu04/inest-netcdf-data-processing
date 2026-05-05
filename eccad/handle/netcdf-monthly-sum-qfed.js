const xlsx = require('xlsx');
const fs = require('fs');
const fastcsv = require('fast-csv');
const { join } = require("path");
const glob = require('glob');
var format = require("string-template");

// Configuration
const CONFIG = {
  NROWS: 79,
  NCOLS: 127,
  YEAR: 2023,
  DATA_FOLDER: join(__dirname, '../data/qfed/json'),
  FILE_PATTERN: `qfed2.emis_{pollutant}.*.json`,
  POLLUTANT_MAPPING_FILE: join(__dirname, 'config/mapping_pollutant_to_cmaq_species_QFED.csv'),
  MAP_FACTOR_FOLDER: join(__dirname, 'resources'),
  MAP_FACTOR_PATTERN: '{province}-percentages-2.json',
  OUTPUT_DIR: join(__dirname, '../output'),
  FILE_PREFIX: 'ant2-hanoi',
  OUTPUT_FOLDER: 'ant2-hanoi2',
  POLLUTANTS: ['so2', 'no', 'oc', 'bc', 'co'],
  CACHE_FOLDER: join(__dirname, 'cache'),
  CACHE_FILE: 'pollutantGridMap.json',
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

// Cache functions
function loadCache() {
  const cacheFilePath = join(CONFIG.CACHE_FOLDER, CONFIG.CACHE_FILE);
  
  if (!fs.existsSync(cacheFilePath)) {
    console.log("Cache file not found, will process data from scratch");
    return false;
  }

  try {
    console.log("Loading cache from:", cacheFilePath);
    const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
    
    // Convert back to Map
    Object.entries(cacheData).forEach(([key, value]) => {
      pollutantGridMap.set(key, value);
    });
    
    console.log(`Cache loaded successfully: ${pollutantGridMap.size} entries`);
    return true;
  } catch (error) {
    console.error("Error loading cache:", error);
    return false;
  }
}

function saveCache() {
  const cacheFilePath = join(CONFIG.CACHE_FOLDER, CONFIG.CACHE_FILE);
  
  // Create cache folder if it doesn't exist
  if (!fs.existsSync(CONFIG.CACHE_FOLDER)) {
    fs.mkdirSync(CONFIG.CACHE_FOLDER, { recursive: true });
  }

  try {
    // Convert Map to plain object for JSON serialization
    const cacheData = Object.fromEntries(pollutantGridMap);
    fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData, null, 2), 'utf8');
    console.log(`Cache saved successfully to: ${cacheFilePath}`);
  } catch (error) {
    console.error("Error saving cache:", error);
  }
}

// Process pollutant data

function processData() {
  const stats = { total: 0, success: 0, error: 0, failedList: [] };

  for (let pollutant of pollutantList) {
    // Use glob pattern to find files
    const pattern = join(CONFIG.DATA_FOLDER, format(CONFIG.FILE_PATTERN, { pollutant }));
    const files = glob.sync(pattern);
    
    if (files.length === 0) {
      console.warn(`No files found matching pattern: ${pattern}`);
      stats.error++;
      continue;
    }

    console.log(`Processing pollutant: ${pollutant}, files found: ${files.length}`);

    files.forEach(fileName => {
      stats.total++;

      try {
        const data = JSON.parse(fs.readFileSync(fileName, 'utf8'));
        data.forEach(({ col, row, value }) => {
          if (value == null) return;

          const key = `${row}:${col}`;
          let entry = pollutantGridMap.get(key);
          
          if (!entry) {
            // Create new entry if not exists
            entry = Object.fromEntries(pollutantList.map(p => [p, 0]));
            pollutantGridMap.set(key, entry);
          }

          entry[pollutant] += value;
        });

        stats.success++;
        console.log(`Processed: ${fileName}`);
      } catch (error) {
        console.error(`Error processing ${fileName}:`, error);
        stats.error++;
        stats.failedList.push(fileName);
      }
    });
  }

  console.log(`Files processed: ${stats.success}/${stats.total} (${stats.error} errors)`);
  console.log("failed files:", stats.failedList);

  const F = 1000 * (3000 * 3000) * 24 * 3600; // [input = kg/m2/s] * [1 cell = 3000m * 3000m] * [24h = 24 * 3600s] -> g / day
  pollutantGridMap.forEach((value, key) => {
    speciesList.forEach(species => {
      value[species] *= F;
    });
  });

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
        const cellData = pollutantGridMap.get(`${rowIdx}:${colIdx}`);
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
  
  // Try to load from cache first
  const cacheLoaded = loadCache();
  
  if (!cacheLoaded) {
    // Process data if cache not available
    processData();
    // Save to cache after processing
    saveCache();
  }
  
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
