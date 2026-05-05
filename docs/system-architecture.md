# Tài liệu hệ thống xử lý dữ liệu NetCDF phát thải

## Tổng quan

Dự án này là tập hợp các script xử lý dữ liệu phát thải phục vụ mô hình CMAQ. Hệ thống không phải là web service độc lập; nó hoạt động theo dạng batch/offline pipeline để chuyển dữ liệu phát thải từ nhiều nguồn về cùng lưới tính toán, cùng định dạng species, cùng cấu trúc thời gian và xuất ra CSV/JSON cho các bước mô phỏng hoặc trực quan hóa phía sau.

Hai nhánh xử lý chính:

| Nhánh | Thư mục | Vai trò |
| --- | --- | --- |
| CMAQ nội bộ | `cmaq/` | Lấy dữ liệu phát thải từ backend MongoDB/Redis qua các service trong `../../v1`, áp dụng hệ số giờ/ngày/species và xuất CSV theo ngày. |
| ECCAD/NetCDF | `eccad/handle/` | Chuyển dữ liệu NetCDF bên ngoài sang JSON trên lưới 3 km, ánh xạ pollutant sang CMAQ species, áp dụng hệ số vùng và xuất CSV theo ngày. |

## Cấu trúc thư mục chính

```text
.
├── cmaq/
│   ├── run.js                    # Chạy tổng hợp tất cả nguồn nội bộ theo khoảng ngày
│   ├── runResidential.js          # Chạy riêng nguồn dân sinh
│   ├── runStraw.js                # Chạy riêng nguồn đốt rơm rạ
│   ├── multi_run.js               # Chia 365 ngày thành nhiều tiến trình node run.js
│   ├── emissionNetcdf.js          # Core pipeline xuất CSV CMAQ từ nguồn nội bộ
│   ├── emission-json.js           # Xuất JSON theo species/ngày/giờ cho web hoặc merge
│   ├── pointSource.js             # Xử lý riêng nguồn điểm nhà máy điện
│   ├── constrains.js              # Header CMAQ species và ánh xạ species -> pollutant
│   ├── day-factor.csv             # Hệ số hiệu chỉnh theo ngày trong năm
│   └── config/power-plan-specy-factor.csv
└── eccad/handle/
    ├── run-ant2.py                # Regrid NetCDF CAMS-GLOB-ANT sang JSON
    ├── run-bio2.py                # Regrid NetCDF CAMS-GLOB-BIO sang JSON
    ├── run-qfed.py                # Regrid QFED NetCDF/NC4 sang JSON
    ├── grid_processing.py         # Tiện ích xarray/xESMF để sort và regrid lưới
    ├── factor.py                  # Tính tỷ lệ giao giữa tỉnh và cell lưới
    ├── mem.py                     # Giới hạn/giám sát RAM cho xử lý NetCDF
    ├── netcdf*.js                 # Chuyển JSON NetCDF sang CSV CMAQ theo ngày
    ├── netcdf/                    # Biến thể xử lý FINN/BIO yearly cũ
    ├── config/*.csv               # Mapping pollutant -> CMAQ species theo nguồn
    └── resources/*.json           # Tỷ lệ phần trăm cell theo tỉnh/vùng
```

## Lưới và chuẩn dữ liệu chung

Hầu hết pipeline mới dùng lưới miền tính toán 79 x 127 cell:

| Tham số | Giá trị | Nơi khai báo |
| --- | --- | --- |
| Điểm bắt đầu | `LAT_START=20.027350`, `LON_START=104.790862` | `eccad/handle/run-*.py`, `factor.py` |
| Bước lưới | `0.02780` độ, xấp xỉ 3 km | `eccad/handle/run-*.py`, `factor.py` |
| Số hàng/cột | `ROWS=79`, `COLS=127` | `cmaq/emissionNetcdf.js`, `eccad/handle/netcdf*.js` |
| Năm xuất | Chủ yếu `2023` | Các script `run.js`, `netcdf*.js` |
| Số timestep/ngày | 25 | Các hàm `writeCsvForDay` |

CSV đầu ra dùng các cột định danh thời gian/không gian:

| Cột | Ý nghĩa |
| --- | --- |
| `TSTEP` | Chỉ số timestep trong ngày, chạy từ 0 đến 24. |
| `YYYYDDD` | Năm + ngày trong năm, ví dụ ngày 1 năm 2023 là `2023001`. Timestep 24 được ghi sang `YYYYDDD + 1`. |
| `HHMMSS` | Giờ dạng `HH0000`; `tstep % 24` được dùng để lấy giờ. |
| `ROW` | Chỉ số hàng của lưới. |
| `COL` | Chỉ số cột của lưới. |

Các cột còn lại là CMAQ species như `CO`, `NH3`, `NO`, `NO2`, `PEC`, `POC`, `SO2`, `PAR`, `TOL`, `XYLMN`... Danh sách species nội bộ nằm trong `cmaq/constrains.js`; các pipeline ECCAD sinh danh sách species từ file mapping CSV tương ứng.

## Luồng xử lý CMAQ nội bộ (`cmaq/`)

### Entrypoint

| Script | Cách dùng | Mục đích |
| --- | --- | --- |
| `node cmaq/run.js <startDay> <endDay> [--verbose]` | Ví dụ `node cmaq/run.js 1 31` | Chạy tất cả nguồn nội bộ và xuất CSV vào `cmaq/output/combine2/`. |
| `node cmaq/runResidential.js <startDay> <endDay> [--verbose]` | Ví dụ `node cmaq/runResidential.js 1 31` | Chạy riêng dân sinh và xuất `cmaq/output/residential/`. |
| `node cmaq/runStraw.js <startDay> <endDay> [--verbose]` | Ví dụ `node cmaq/runStraw.js 121 181` | Chạy riêng đốt rơm rạ và xuất `cmaq/output/straw/`. |
| `node cmaq/multi_run.js` | Không nhận tham số | Chia ngày 1-365 thành 8 tiến trình gọi `run.js`. |
| `node cmaq/emission-json.js <species>` | Ví dụ `node cmaq/emission-json.js SO2` | Xuất JSON theo từng ngày cho một species vào `cmaq/output/total2/<yyyy-mm-dd>/`. |

### Đầu vào

| Loại đầu vào | Nguồn/file | Nội dung |
| --- | --- | --- |
| Backend service | `../../v1/population/services/residentialEmission.service` | Phát thải dân sinh theo pollutant, năm, tỉnh, độ phân giải. |
| Backend service | `../../v1/straw/services/strawEmission.service` | Phát thải đốt rơm rạ theo mùa vụ. |
| Backend service | `../../v1/industry/services/industrialEmission.service` | Phát thải công nghiệp nhỏ, công nghiệp lớn, nhà máy điện. |
| Backend service | `../../v1/traffic/services/areaSourceTrafficEmission.service` | Phát thải giao thông nguồn diện. |
| Backend service | `../../v1/material/services/materialEmission.service` | Phát thải vật liệu. |
| MongoDB models | Các model hệ số giờ trong `../../v1/*/models` | Hệ số phân bổ theo giờ cho dân sinh, rơm rạ, giao thông weekday/weekend. |
| Redis/MongoDB connection | `../../v1/databases/init.mongodb`, `../../v1/utils/redis` | Kết nối backend cần có khi chạy script. |
| CSV | `cmaq/day-factor.csv` | Hệ số hiệu chỉnh theo ngày trong năm. |
| JS config | `cmaq/constrains.js` | Danh sách dimensions, species và tỷ lệ species -> pollutant. |
| CSV | `cmaq/config/power-plan-specy-factor.csv` | Hệ số speciation riêng cho nguồn nhà máy điện trong `pointSource.js`. |

Các pollutant gốc trong `emissionNetcdf.js` gồm: `BC`, `CH4`, `CO`, `CO2`, `N2O`, `NH3`, `NMVOC`, `NOx`, `OC`, `PM10`, `PM2.5`, `SO2`.

### Các bước xử lý

1. `run.js` đọc tham số CLI `startDay`, `endDay`, `--verbose`.
2. Gọi lần lượt các hàm nguồn trong `emissionNetcdf.js`: `residential`, `strawDx`, `strawHt`, `areaSourceTraffic`, `industrySmall`, `industryLarge`, `powerPlant`, `material`.
3. Mỗi nguồn gọi `loadOrCalculateEmissionSource` để lấy dữ liệu theo pollutant:
   - Nếu có cache ở `cmaq/cache/<source>_<year>_<resolution>.json` thì đọc lại.
   - Nếu chưa có cache thì gọi service backend, chuẩn hóa về map theo key `row:col`, rồi ghi cache.
4. Phân bổ phát thải năm/tháng/mùa vụ xuống giờ:
   - Dân sinh: `t/year -> t/day -> t/hour` theo hệ số giờ từ MongoDB.
   - Rơm rạ Đông Xuân: chia theo khoảng ngày `244-304`, dùng hệ số giờ vụ Đông Xuân.
   - Rơm rạ Hè Thu: chia theo khoảng ngày `121-181`, dùng hệ số giờ vụ Hè Thu.
   - Giao thông: tạo hai map weekday/weekend, chọn theo `isWeekend(day)`.
   - Công nghiệp/vật liệu/nhà máy điện trong `emissionNetcdf.js`: chia đều `t/year / 365 / 24`.
5. `getSpecyValue(specy,row,col,hour,day)` cộng giá trị từ các nguồn phù hợp, áp dụng:
   - Tỷ lệ speciation trong `speciesToPollutant`.
   - `dayFactor` từ `day-factor.csv`.
   - `convertFactor = 1_000_000 / 3600`, chuyển `t/h` sang `g/s`.
6. `writeCsvForDay(day,filePrefix,folder)` ghi CSV cho từng ngày với 25 timestep, toàn bộ lưới 79 x 127.
7. Sau khi nạp dữ liệu nguồn, script ngắt kết nối MongoDB và Redis bằng `mongoDisconnect()` và `redisDisconnect()`.

### Đầu ra

| Script | Đường dẫn đầu ra | Định dạng |
| --- | --- | --- |
| `cmaq/run.js` | `cmaq/output/combine2/all_combine_emission_<YYYYDDD>.csv` | CSV CMAQ theo ngày, toàn bộ nguồn nội bộ. |
| `cmaq/runResidential.js` | `cmaq/output/residential/all_residential_emission_<YYYYDDD>.csv` | CSV CMAQ theo ngày, riêng dân sinh. |
| `cmaq/runStraw.js` | `cmaq/output/straw/all_straw_emission_<YYYYDDD>.csv` | CSV CMAQ theo ngày, riêng rơm rạ. |
| `cmaq/emission-json.js` | `cmaq/output/total2/<yyyy-mm-dd>/web-<species>.json` | JSON gồm `hour`, `time`, `row`, `col`, `value`. |
| `cmaq/pointSource.js` | `cmaq/output/power-plant/power_plant_<YYYYDDD>.csv` nếu bật `main()` | CSV nguồn điểm nhà máy điện. |

## Luồng xử lý ECCAD/NetCDF (`eccad/handle/`)

Pipeline ECCAD thường có hai giai đoạn: Python regrid NetCDF sang JSON, sau đó Node.js chuyển JSON sang CSV CMAQ.

### Giai đoạn 1: Regrid NetCDF sang JSON

Entrypoint Python:

| Script | Nguồn dữ liệu | Input pattern | Output |
| --- | --- | --- | --- |
| `run-ant2.py` | CAMS-GLOB-ANT monthly 2023 | `~/inest/eccad/data/ant2/nc/*.nc`, lọc file kết thúc `2023.nc` | `~/inest/eccad/data/ant2/json/*.json` |
| `run-bio2.py` | CAMS-GLOB-BIO monthly 2023 | `~/inest/eccad/data/bio2/nc/*.nc`, lọc file kết thúc `2023.nc` | `~/inest/eccad/data/bio2/json/*.json` |
| `run-qfed.py` | QFED daily/NC4 | `~/inest/eccad/data/qfed/nc/*.nc4` | `~/inest/eccad/data/qfed/json/*.json` |

Luồng xử lý:

1. Thiết lập `HOME=/mnt/disk1/aiotlab/trieutq` trong script.
2. Đọc NetCDF bằng `xarray.open_dataset`.
3. Gọi `sort_ds` để sắp xếp lại chiều `lat`, `lon` tăng dần và đảm bảo dữ liệu contiguous.
4. Tạo regridder bằng `xESMF` qua `create_regridder(..., method="conservative")`.
5. Regrid dữ liệu về lưới 79 x 127, bước 0.02780 độ.
6. Chuyển dataset sang dataframe, tạo `row`, `col` từ thứ tự `lat`, `lon`.
7. Chọn biến giá trị theo thứ tự có trong dataset: `sum`, `emiss_bb`, `emiss_bio`, `all_sources`, hoặc `biomass` tùy script.
8. Chuyển đơn vị nếu có khai báo:
   - `Tg`: nhân `STEP_FACTOR * 1e12` để ra gram theo cell mới.
   - `kg m-2 s-1`: nhân `(3000*3000) * (30*24*3600) * 1000` để ra gram/tháng/cell 3 km.
9. Ghi JSON records với cấu trúc `time`, `row`, `col`, `lat`, `lon`, `value`.

### Giai đoạn 2: JSON sang CSV CMAQ

Entrypoint Node.js:

| Script | Nguồn JSON | Mapping | Output |
| --- | --- | --- | --- |
| `netcdf.js` | `../data/gfed4/json2` | `mapping_pollutant_to_cmaq_species_GFED4.csv` | `../output/gfed4-hanoi/` |
| `netcdf-qfed.js` | `../data/qfed/json` | `mapping_pollutant_to_cmaq_species_QFED.csv` | `../output/qfed-7tinh/` |
| `netcdf-monthly.js` | `../data/ant2/json` | `mapping_pollutant_to_cmaq_species_ANT.csv` | `../output/ant2-7tinh/` |
| `netcdf-monthly-bio.js` | `../data/bio2/json` | `mapping_pollutant_to_cmaq_species_BIO.csv` | `../output/bio2-7tinh/` |
| `netcdf-monthly-merge.js` | `../data/ant2/json` + web JSON từ `cmaq/output/total2` | `mapping_pollutant_to_cmaq_species_ANT.csv` | `../output/ant2-merge2/` |
| `netcdf/finn.js` + `netcdf/run_finn.js` | `~/inest/eccad/finn-total/json` | Mapping hard-code trong file | `eccad/handle/netcdf/output/finn2/` |
| `netcdf/bio.js` + `netcdf/run_bio.js` | `~/inest/eccad/bio-total/json` | Mapping hard-code trong file | `eccad/handle/netcdf/output/bio2/` |

Các script nhận tham số ngày tương tự:

```bash
node eccad/handle/netcdf-monthly.js <startDay> <endDay> [--verbose]
node eccad/handle/netcdf-qfed.js <startDay> <endDay> [--verbose]
node eccad/handle/netcdf-monthly-bio.js <startDay> <endDay> [--verbose]
```

Luồng xử lý chung:

1. Đọc mapping pollutant -> species từ CSV bằng package `xlsx` với header `pollutant`, `species`, `ratio`.
2. Tạo `speciesList` từ mapping để sinh header CSV.
3. Đọc các JSON đầu vào theo `FILE_PATTERN` cho từng pollutant.
4. Với từng record `row`, `col`, `time`, `value`, cộng vào `dataMap` theo key `row:col:time` sau khi nhân `ratio`.
5. Đọc `resources/*-percentages-2.json` để lấy tỷ lệ phần trăm cell thuộc tỉnh/vùng. Một số script dùng `1 - percentage/100` để loại phần đã có dữ liệu nội bộ, ví dụ biến `EXCLUDE_HANOI` hoặc `excludeHanoiFactorMap`.
6. Áp dụng hệ số chuyển đổi đơn vị:
   - `netcdf.js`: `1_000_000 * 1_000_000 / 24 / 3600`, dùng cho dữ liệu daily/yearly dạng tổng theo ngày rồi đổi sang g/s.
   - `netcdf-qfed.js`: `1000 * (3000 * 3000)`, chuyển `kg/m2/s` sang `g/s` trên cell 3 km.
   - `netcdf-monthly*.js`: `1 / (24 * 3600)`, sau đó khi ghi ngày chia tiếp theo số ngày của tháng để phân bổ monthly value xuống ngày.
7. `writeCsvForDay` ghi CSV 25 timestep/ngày, lưới 79 x 127, header gồm dimensions + species.

### Tính tỷ lệ vùng/tỉnh (`factor.py`)

`eccad/handle/factor.py` tạo các file `resources/*-percentages-2.json`:

1. Đọc GeoJSON `resources/diaphantinh.geojson`.
2. Lọc các tỉnh mục tiêu: Hà Nội, Vĩnh Phúc, Bắc Ninh, Hải Dương, Hải Phòng, Hưng Yên, Quảng Ninh.
3. Tạo lưới 79 x 127 với cùng `LAT_START`, `LON_START`, `CELL_STEP`.
4. Tính phần trăm diện tích giao giữa polygon tỉnh và từng cell.
5. Xuất JSON records gồm `row`, `col`, `lat`, `lon`, `percentage`.

Các file percentage này được dùng để crop, loại trừ, hoặc merge dữ liệu theo vùng trong các script NetCDF.

## Định dạng đầu vào chi tiết

### NetCDF gốc

Các script Python yêu cầu dataset có tọa độ `lat`, `lon` và biến dữ liệu thuộc một trong các tên sau:

| Biến | Nguồn thường gặp |
| --- | --- |
| `sum` | Dữ liệu tổng hợp pollutant. |
| `emiss_bb` | Biomass/burning emission. |
| `emiss_bio` | Biogenic emission. |
| `all_sources` | Tổng mọi nguồn. |
| `biomass` | QFED biomass. |

### JSON trung gian từ NetCDF

```json
[
  {
    "time": "2023-01-01",
    "row": 0,
    "col": 0,
    "lat": 20.02735,
    "lon": 104.790862,
    "value": 123.45
  }
]
```

### Mapping pollutant -> CMAQ species

Các file `eccad/handle/config/mapping_pollutant_to_cmaq_species_*.csv` được đọc như bảng có ba cột logic:

| Cột | Ý nghĩa |
| --- | --- |
| `pollutant` | Tên pollutant trong file JSON/NetCDF nguồn. |
| `species` | Tên CMAQ species trong CSV đầu ra. |
| `ratio` | Hệ số phân rã pollutant sang species. |

### Percentage resources

```json
[
  {
    "row": 10,
    "col": 20,
    "lat": 20.30535,
    "lon": 105.346862,
    "percentage": 42.5
  }
]
```

## Định dạng đầu ra chi tiết

### CSV CMAQ theo ngày

Tên file thường có dạng:

```text
<file-prefix>_<YYYYDDD>.csv
```

Ví dụ:

```text
all_combine_emission_2023001.csv
ant2-7tinh_2023001.csv
qfed_2023001.csv
```

Dòng dữ liệu điển hình:

```csv
TSTEP,YYYYDDD,HHMMSS,ROW,COL,CO,NH3,NO,NO2,SO2,...
0,2023001,0,0,0,0.0,0.0,0.0,0.0,0.0,...
```

Mỗi file ngày gồm tối đa `25 * 79 * 127 = 250825` dòng dữ liệu, chưa tính header, với các pipeline dùng lưới 79 x 127.

### JSON web/species

`cmaq/emission-json.js` xuất JSON theo ngày và species:

```json
[
  {
    "hour": 0,
    "time": "2023-01-01",
    "row": 0,
    "col": 0,
    "value": 0.0
  }
]
```

## Phụ thuộc môi trường

| Nhóm | Phụ thuộc |
| --- | --- |
| Node.js | `fast-csv`, `xlsx`, `glob`, `stream-chain`, `stream-json`, `string-template` trong `eccad/handle/package.json`; nhánh `cmaq/` cũng dùng `fast-csv` và backend `../../v1`. |
| Python | `xarray`, `numpy`, `matplotlib`, `xesmf`, `geopandas`, `shapely`, `resource` trên Linux. |
| Dữ liệu ngoài repo | Các thư mục `~/inest/eccad/data/...`, `~/inest/eccad/*-total/json`, và đường dẫn tuyệt đối `/mnt/disk1/aiotlab/trieutq/...`. |
| Backend nội bộ | MongoDB, Redis, các service/model trong `../../v1`. |

## Ghi chú vận hành

- Các script có nhiều đường dẫn hard-code theo máy triển khai, đặc biệt `HOME=/mnt/disk1/aiotlab/trieutq`, `~/inest/eccad/data/...` và `WEB_DATA_FOLDER` trong `netcdf-monthly-merge.js`.
- `cmaq/emissionNetcdf.js` tạo cache JSON trong `cmaq/cache/`; nếu dữ liệu backend thay đổi nhưng cache còn cũ, cần xóa cache tương ứng trước khi chạy lại.
- `multi_run.js` trong `cmaq/` và `eccad/handle/` chia ngày thành nhiều tiến trình để tăng tốc, nhưng sẽ nhân mức dùng RAM/IO theo số tiến trình.
- `eccad/handle/mem.py` giới hạn bộ nhớ dựa trên `/proc/meminfo`, nên chỉ phù hợp môi trường Linux.
- Một số script cũ trong `eccad/handle/netcdf/` dùng lưới 118 x 139 và mapping hard-code; cần phân biệt với pipeline 79 x 127 mới.

## Tóm tắt luồng end-to-end

```text
Nguồn nội bộ MongoDB/Redis ─┐
                            ├─ cmaq/emissionNetcdf.js ── CSV CMAQ nội bộ theo ngày
Hệ số giờ/ngày/species ─────┘

NetCDF ECCAD/QFED/CAMS ── Python regrid xESMF ── JSON row/col/value ── Node mapping species ── CSV CMAQ ngoài miền/nền

GeoJSON tỉnh ── factor.py ── resources/*-percentages-2.json ── crop/exclude/merge theo vùng

CSV/JSON nội bộ + CSV nền ngoài ── netcdf-monthly-merge.js ── CSV CMAQ đã merge theo ngày
```

## Tài liệu tham chiếu trong code

- `cmaq/run.js`
- `cmaq/emissionNetcdf.js`
- `cmaq/emission-json.js`
- `cmaq/pointSource.js`
- `cmaq/constrains.js`
- `eccad/handle/run-ant2.py`
- `eccad/handle/run-bio2.py`
- `eccad/handle/run-qfed.py`
- `eccad/handle/grid_processing.py`
- `eccad/handle/factor.py`
- `eccad/handle/netcdf.js`
- `eccad/handle/netcdf-qfed.js`
- `eccad/handle/netcdf-monthly.js`
- `eccad/handle/netcdf-monthly-bio.js`
- `eccad/handle/netcdf-monthly-merge.js`
