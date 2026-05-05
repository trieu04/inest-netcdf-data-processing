# Global imports and configuration
import xarray as xr
import numpy as np
import matplotlib.pyplot as plt
import os
import sys
import glob
import json

from grid_processing import sort_ds, create_regridder

# Environment setup
print(f"Working directory: {os.getcwd()}")
print(f"Python executable: {sys.executable}")
os.environ['HOME'] = '/mnt/disk1/aiotlab/trieutq'

# Global grid parameters
LAT_START, LON_START = 20.027350, 104.790862
STEP_NEW = 0.02780
ROWS, COLS = 79, 127

# Global paths
BASE_DIR = os.path.expanduser('~/inest/eccad/data/qfed')
OUTPUT_DIR = os.path.join(BASE_DIR, 'json')
NC_DIR = os.path.join(BASE_DIR, 'nc')
DATA_FILE_PATT = "*.nc4"

print(f"Grid parameters: {ROWS}x{COLS}, step={STEP_NEW}")
print(f"Base directory: {BASE_DIR}")

# Batch process NC files to JSON
os.makedirs(OUTPUT_DIR, exist_ok=True)
nc_files = glob.glob(os.path.join(NC_DIR, DATA_FILE_PATT))

def ds_to_json(ds_new: xr.Dataset, max_rows: int = None) -> list[dict]:
    """Convert dataset to JSON format with row/col indices"""
    df = ds_new.to_dataframe().reset_index()

    # Create row/col indices
    lat_vals = df["lat"].unique()
    lon_vals = df["lon"].unique()
    lat_to_row = {v: i for i, v in enumerate(lat_vals)}
    lon_to_col = {v: i for i, v in enumerate(lon_vals)}

    df["row"] = df["lat"].map(lat_to_row)
    df["col"] = df["lon"].map(lon_to_col)

    if "sum" in df.columns:
        df["value"] = df["sum"]
    elif "emiss_bb" in df.columns:
        df["value"] = df["emiss_bb"]
    elif "emiss_bio" in df.columns:
        df["value"] = df["emiss_bio"]
    elif "all_sources" in df.columns:
        df["value"] = df["all_sources"]
    elif "biomass" in df.columns:
        df["value"] = df["biomass"]
    else:
        print(df)
        raise ValueError("Dataset does not contain required variables.")

    # Reorder columns
    df["time"] = df["time"].dt.strftime("%Y-%m-%d")

    df = df[["time", "row", "col", "lat", "lon", "value"]]

    if max_rows:
        df = df.iloc[:max_rows]

    return df.to_dict(orient="records")

regidder = None
for nc_file in nc_files:
    print(f"Processing {os.path.basename(nc_file)}")
    # Load and process dataset
    ds = sort_ds(xr.open_dataset(nc_file))
    if regidder is None:
        print("Creating regridder...")
        regidder = create_regridder(ds, lat_start=LAT_START, lon_start=LON_START, rows=ROWS, cols=COLS, step=STEP_NEW, method="conservative")
        print("Regridder created.")
    ds_new = regidder(ds)
    json_data = ds_to_json(ds_new)

    # Save JSON
    json_filename = os.path.splitext(os.path.basename(nc_file))[0] + '.json'
    json_path = os.path.join(OUTPUT_DIR, json_filename)

    with open(json_path, "w") as f:
        json.dump(json_data, f, indent=2)

    print(f"Saved {json_path}")

