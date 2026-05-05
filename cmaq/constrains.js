const path = require("path")
const fs = require("fs")
const dimensionsArray = ['TSTEP', 'YYYYDDD', 'HHMMSS', 'ROW', 'COL'];
const valuesArray = [
  'FORM', 'FORM_PRIMARY', 'BENZ', 'ALD2', 'ALD2_PRIMARY', 'NAPH',
  'BUTADIENE13', 'ACROLEIN', 'CL2', 'CO', 'NH3', 'NH3_FERT', 'ACET', 'ALDX', 'CH4', 'ETH', 'ETHA', 'ETHY', 'ETOH',
  'IOLE', 'ISOP', 'KET', 'MEOH', 'NVOL', 'OLE', 'PAR', 'PRPA', 'SOAALK', 'TERP', 'TOL', 'UNR', 'XYLMN', 'HONO',
  'NO', 'NO2', 'PAL', 'PCA', 'PCL', 'PEC', 'PFE', 'PH2O', 'PK', 'PMG', 'PMN', 'PMOTHR', 'PNA', 'PNCOM', 'PNH4',
  'PNO3', 'POC', 'PSI', 'PSO4', 'PTI', 'PMC', 'SO2', 'SULF', 'VOC_INV', 'CH4_INV', 'CO2_INV', 'N2O_INV'
];

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

const specyPollutantMap = new Map();
function readSpecyPollutantMap(){
  const csvFilePath = path.join(__dirname, 'config/power-plan-specy-factor.csv');
  const csvData = fs.readFileSync(csvFilePath, 'utf8');
  const lines = csvData.trim().split('\n');
  for (const line of lines) {
    const [species, pollutant, ratioStr] = line.split(',');
    const ratio = Number(ratioStr);
    if (species && pollutant && !isNaN(ratio)) {
      specyPollutantMap.set(species, { pollutant, ratio });
    }
  }
  console.log("Species to pollutant mapping loaded:", specyPollutantMap);
}
readSpecyPollutantMap();

const speciesToPollutant = {
  PEC: { pollutant: 'BC', ratio: 1.0 },
  CH4: { pollutant: 'CH4', ratio: 1.0 },
  CH4_INV: { pollutant: 'CH4', ratio: 0.0 },
  CO: { pollutant: 'CO', ratio: 1.0 },
  CO2_INV: { pollutant: 'CO2', ratio: 1.0 },
  N2O_INV: { pollutant: 'N2O', ratio: 1.0 },
  NH3: { pollutant: 'NH3', ratio: 1.0 },
  NH3_FERT: { pollutant: 'NH3', ratio: 0.0 },
  ACET: { pollutant: 'NMVOC', ratio: 0.0324019 },
  ACROLEIN: { pollutant: 'NMVOC', ratio: 0.0109799 },
  ALD2: { pollutant: 'NMVOC', ratio: 0.0178101 },
  ALD2_PRIMARY: { pollutant: 'NMVOC', ratio: 0.008905 },
  ALDX: { pollutant: 'NMVOC', ratio: 0.0029683 },
  BENZ: { pollutant: 'NMVOC', ratio: 0.0186279 },
  BUTADIENE13: { pollutant: 'NMVOC', ratio: 0.0109799 },
  ETH: { pollutant: 'NMVOC', ratio: 0.028169 },
  ETHA: { pollutant: 'NMVOC', ratio: 0.0121157 },
  ETHY: { pollutant: 'NMVOC', ratio: 0.045131 },
  ETOH: { pollutant: 'NMVOC', ratio: 0.1862426 },
  FORM: { pollutant: 'NMVOC', ratio: 0 },
  FORM_PRIMARY: { pollutant: 'NMVOC', ratio: 0.0093897 },
  IOLE: { pollutant: 'NMVOC', ratio: 0.0020218 },
  ISOP: { pollutant: 'NMVOC', ratio: 0.0 },
  KET: { pollutant: 'NMVOC', ratio: 0.0265107 },
  MEOH: { pollutant: 'NMVOC', ratio: 0.0354748 },
  NAPH: { pollutant: 'NMVOC', ratio: 0.0219597 },
  NVOL: { pollutant: 'NMVOC', ratio: 0.0348327 },
  OLE: { pollutant: 'NMVOC', ratio: 0.0114569 },
  PAR: { pollutant: 'NMVOC', ratio: 0.2547327 },
  PRPA: { pollutant: 'NMVOC', ratio: 0.0195366 },
  SOAALK: { pollutant: 'NMVOC', ratio: 0.1141905 },
  TERP: { pollutant: 'NMVOC', ratio: 0.0001514 },
  TOL: { pollutant: 'NMVOC', ratio: 0.050886 },
  VOC_INV: { pollutant: 'NMVOC', ratio: 0.0348327 },
  XYLMN: { pollutant: 'NMVOC', ratio: 0.0445252 },
  NO: { pollutant: 'NOx', ratio: 0.9 },
  NO2: { pollutant: 'NOx', ratio: 0.1 },
  POC: { pollutant: 'OC', ratio: 1.0 },
  PMC: { pollutant: 'PM10', ratio: 1.0 },
  PAL: { pollutant: 'PM2.5', ratio: 0.0035 },
  PCA: { pollutant: 'PM2.5', ratio: 0.0047917 },
  PCL: { pollutant: 'PM2.5', ratio: 0.0097917 },
  PFE: { pollutant: 'PM2.5', ratio: 0.0044792 },
  PH2O: { pollutant: 'PM2.5', ratio: 0.0 },
  PK: { pollutant: 'PM2.5', ratio: 0.01125 },
  PMG: { pollutant: 'PM2.5', ratio: 0.0020542 },
  PMN: { pollutant: 'PM2.5', ratio: 0.0006875 },
  PMOTHR: { pollutant: 'PM2.5', ratio: 0.3289271 },
  PNA: { pollutant: 'PM2.5', ratio: 0.003125 },
  PNCOM: { pollutant: 'PM2.5', ratio: 0.12875 },
  PNH4: { pollutant: 'PM2.5', ratio: 0.0566667 },
  PNO3: { pollutant: 'PM2.5', ratio: 0.0570833 },
  PSI: { pollutant: 'PM2.5', ratio: 0.004375 },
  PSO4: { pollutant: 'PM2.5', ratio: 0.1308333 },
  PTI: { pollutant: 'PM2.5', ratio: 0.0016021 },
  SO2: { pollutant: 'SO2', ratio: 1.0 },
};

const convertFactor = 1_000_000 / 3600; // convert t/h to g/s

module.exports = {
  dimensionsArray,
  valuesArray,
  speciesToPollutant,
  convertFactor
}
