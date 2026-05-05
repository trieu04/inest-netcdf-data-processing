import xarray as xr
import numpy as np
import xesmf as xe

def sort_ds (
    ds: xr.Dataset,
):
    if ("lat" in ds.coords and ds.coords["lat"].size > 1 and ds.coords["lat"][0] > ds.coords["lat"][-1]):
        ds = ds.sortby("lat")
    if ("lon" in ds.coords and ds.coords["lon"].size > 1 and ds.coords["lon"][0] > ds.coords["lon"][-1]):
        ds = ds.sortby("lon")
    for v in ds.data_vars:
        ds[v].data = np.ascontiguousarray(ds[v].data)
    return ds

def create_regridder(
    ds: xr.Dataset,
    lat_start: float,
    lon_start: float,
    rows: int,
    cols: int,
    step: float,
    method: str = "conservative",
) -> xe.Regridder:
    """
    Create xESMF regridder

    Parameters
    ----------
    ds : xr.Dataset
        Input dataset (must have lat, lon)
    lat_start : float
        Starting latitude
    lon_start : float
        Starting longitude
    rows : int
        Number of rows in new grid
    cols : int
        Number of cols in new grid
    step : float
        Grid spacing (degree)
    method : str
        Regridding method: "bilinear", "patch", "nearest_s2d", "nearest_d2s", "conservative", "conservative_normed"

    Returns
    -------
    xe.Regridder object
    """

    # Create new coordinate arrays
    lat_new = lat_start + np.arange(rows) * step
    lat_new = lat_new[(lat_new >= -90.0) & (lat_new <= 90.0)]

    lon_new = lon_start + np.arange(cols) * step
    lon_new = ((lon_new + 180.0) % 360.0) - 180.0
    lon_new = np.unique(np.round(lon_new, 8))

    # new lat/lon arrays
    lat_new = lat_start + np.arange(rows) * step
    lon_new = lon_start + np.arange(cols) * step
    ds_out = xr.Dataset(
        {
            "lat": (["lat"], lat_new),
            "lon": (["lon"], lon_new),
        }
    )

    # create regridder
    try:
        regridder = xe.Regridder(ds, ds_out, method, reuse_weights=True)
    except ValueError:
        regridder = xe.Regridder(ds, ds_out, method, reuse_weights=False)

    return regridder

def build_new_grid_xesmf(
    ds: xr.Dataset,
    lat_start: float,
    lon_start: float,
    rows: int,
    cols: int,
    step: float,
    method: str = "conservative",
) -> xr.Dataset:
    """
    2D interpolation (regrid) with xESMF

    Parameters
    ----------
    ds : xr.Dataset
        Input dataset (must have lat, lon)
    lat_start : float
        Starting latitude
    lon_start : float
        Starting longitude
    rows : int
        Number of rows in new grid
    cols : int
        Number of cols in new grid
    step : float
        Grid spacing (degree)
    method : str
        Regridding method: "bilinear", "patch", "nearest_s2d", "nearest_d2s", "conservative", "conservative_normed"

    Returns
    -------
    xr.Dataset with new lat/lon grid
    """

    # Create new coordinate arrays
    lat_new = lat_start + np.arange(rows) * step
    lat_new = lat_new[(lat_new >= -90.0) & (lat_new <= 90.0)]

    lon_new = lon_start + np.arange(cols) * step
    lon_new = ((lon_new + 180.0) % 360.0) - 180.0
    lon_new = np.unique(np.round(lon_new, 8))

    # new lat/lon arrays
    lat_new = lat_start + np.arange(rows) * step
    lon_new = lon_start + np.arange(cols) * step
    ds_out = xr.Dataset(
        {
            "lat": (["lat"], lat_new),
            "lon": (["lon"], lon_new),
        }
    )

    # create regridder
    try:
        regridder = xe.Regridder(ds, ds_out, method, reuse_weights=True)
    except ValueError:
        regridder = xe.Regridder(ds, ds_out, method, reuse_weights=False)

    ds_new = regridder(ds)

    return ds_new
