const fs = require('fs');
const path = require('path');
const fastcsv = require('fast-csv');
const { join } = require("path");

const NROWS = 118;
const NCOLS = 139;

const pollutantMappings = [
  { pollutant: "isoprene", species: "ISOP", ratio: 1 },
  { pollutant: "pinene-a", species: "TERP", ratio: 1 },
  { pollutant: "pinene-b", species: "TERP", ratio: 1 },
  { pollutant: "other-monoterpenes", species: "TERP", ratio: 1 },
  { pollutant: "sesquiterpenes", species: "SESQ", ratio: 1 },
  { pollutant: "MBO", species: "MBO", ratio: 1 },
  { pollutant: "ethene", species: "ETH", ratio: 1 },
  { pollutant: "propene", species: "OLE", ratio: 0.67 },
  { pollutant: "propene", species: "PAR", ratio: 0.33 },
  { pollutant: "butenes-and-higher-alkenes", species: "OLE", ratio: 0.375 },
  { pollutant: "butenes-and-higher-alkenes", species: "IOLE", ratio: 0.375 },
  { pollutant: "butenes-and-higher-alkenes", species: "PAR", ratio: 0.25 },
  { pollutant: "ethane", species: "ETHA", ratio: 1 },
  { pollutant: "propane", species: "PRPA", ratio: 1 },
  { pollutant: "butanes-and-higher-alkanes", species: "PAR", ratio: 0.97 },
  { pollutant: "acetylene", species: "ETHY", ratio: 1 },
  { pollutant: "ketones", species: "ACET", ratio: 0.55 },
  { pollutant: "ketones", species: "KET", ratio: 0.45 },
  { pollutant: "acetone", species: "ACET", ratio: 1 },
  { pollutant: "other-ketones", species: "KET", ratio: 1 },
  { pollutant: "formaldehyde", species: "FORM_PRIMARY", ratio: 1 },
  { pollutant: "acetaldehyde", species: "ALD2_PRIMARY", ratio: 1 },
  { pollutant: "other-aldehydes", species: "ALDX", ratio: 1 },
  { pollutant: "acetic-acid", species: "AACD", ratio: 1 },
  { pollutant: "formic-acid", species: "FACD", ratio: 1 },
  { pollutant: "ethanol", species: "ETOH", ratio: 1 },
  { pollutant: "methanol", species: "MEOH", ratio: 1 },
  { pollutant: "hydrogen-cyanide", species: "NVOL", ratio: 1 },
  { pollutant: "methyl-iodide", species: "NVOL", ratio: 1 },
  { pollutant: "methyl-chloride", species: "NVOL", ratio: 1 },
  { pollutant: "methyl-bromide", species: "NVOL", ratio: 1 },
  { pollutant: "CO", species: "CO", ratio: 1 },
  { pollutant: "toluene", species: "TOL", ratio: 1 },
  { pollutant: "benzene", species: "BENZ", ratio: 1 },
  { pollutant: "xylene", species: "XYLMN", ratio: 1 },
  { pollutant: "other-aromatics", species: "XYLMN", ratio: 1 }
];

const speciesList = [
  "ISOP",
  "TERP",
  "SESQ",
  "MBO",
  "ETH",
  "OLE",
  "PAR",
  "IOLE",
  "ETHA",
  "PRPA",
  "ETHY",
  "ACET",
  "KET",
  "FORM_PRIMARY",
  "ALD2_PRIMARY",
  "ALDX",
  "AACD",
  "FACD",
  "ETOH",
  "MEOH",
  "NVOL",
  "CO",
  "TOL",
  "BENZ",
  "XYLMN"
];

const pollutantList = [
  "isoprene",
  "pinene-a",
  "pinene-b",
  "other-monoterpenes",
  "sesquiterpenes",
  "MBO",
  "ethene",
  "propene",
  "butenes-and-higher-alkenes",
  "ethane",
  "propane",
  "butanes-and-higher-alkanes",
  "acetylene",
  "ketones",
  "acetone",
  "other-ketones",
  "formaldehyde",
  "acetaldehyde",
  "other-aldehydes",
  "acetic-acid",
  "formic-acid",
  "ethanol",
  "methanol",
  "hydrogen-cyanide",
  "methyl-iodide",    // CH₃I
  "methyl-chloride",  // CH₃Cl
  "methyl-bromide",   // CH₃Br
  "CO",
  "toluene",
  "benzene",
  "xylene",
  "other-aromatics"
];

const speciesValues = {
  "ISOP": 0,
  "TERP": 0,
  "SESQ": 0,
  "MBO": 0,
  "ETH": 0,
  "OLE": 0,
  "PAR": 0,
  "IOLE": 0,
  "ETHA": 0,
  "PRPA": 0,
  "ETHY": 0,
  "ACET": 0,
  "KET": 0,
  "FORM_PRIMARY": 0,
  "ALD2_PRIMARY": 0,
  "ALDX": 0,
  "AACD": 0,
  "FACD": 0,
  "ETOH": 0,
  "MEOH": 0,
  "NVOL": 0,
  "CO": 0,
  "TOL": 0,
  "BENZ": 0,
  "XYLMN": 0,
}

const map = new Map(); // key col:row, value is speciesValues
for (let row = 0; row < NROWS; row++) {
  for (let col = 0; col < NCOLS; col++) {
    const key = `${row}:${col}`;
    map.set(key, { ...speciesValues });
  }
}

const jsonFolder = '~/inest/eccad/bio-total/json';
const getFileName = (pollutant) => {
  return `${jsonFolder}/CAMS-GLOB-BIO_Glb_0.25x0.25_bio_${pollutant}_v3.1_yearly_2023.json`;
};

for (const pollutant of pollutantList) {
  const fileName = getFileName(pollutant);

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
        const { row, col, emiss_bio } = entry;
        const key = `${row}:${col}`;
        const speciesValue = map.get(key);
        if (!speciesValue) {
          console.warn(`No data for key ${key}`);
          continue;
        }

        if (emiss_bio === undefined || emiss_bio === null) {
          console.warn(`Missing emiss_bio for entry at lon: ${lon}, lat: ${lat}`);
          continue;
        }

        for (const field of fields) {
          const { species, ratio } = field;
          if (speciesValue.hasOwnProperty(species)) {
            speciesValue[species] += emiss_bio * ratio;
          } else {
            console.warn(`Species ${species} not found in speciesValues`);
          }
        }
      }

      console.log(`Successfully read ${pollutant} data:`);
      // You can process the data here
      // Example: console.log(data);

    } else {
      console.log(`File not found: ${expandedPath}`);
    }
  } catch (error) {
    console.error(`Error reading ${pollutant} file:`, error.message);
  }
}

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
  writeCsvForDay(1, 'bio', 'test');
}
