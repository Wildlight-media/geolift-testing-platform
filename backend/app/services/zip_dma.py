"""Zip code -> DMA (Nielsen Designated Market Area) conversion, used as an
optional aggregation step at dataset upload time.

The crosswalk in app/data/zip_to_dma.tsv is a publicly circulated
approximation (zip centroid plotted against DMA boundaries), not official
licensed Nielsen data - see README for details and where to swap in an
organization-supplied crosswalk instead.
"""

import functools
from pathlib import Path

import pandas as pd

CROSSWALK_PATH = Path(__file__).parent.parent / "data" / "zip_to_dma.tsv"


@functools.lru_cache(maxsize=1)
def _load_crosswalk() -> dict[str, str]:
    df = pd.read_csv(CROSSWALK_PATH, sep="\t", dtype=str)
    df["zip_code"] = df["zip_code"].str.zfill(5)
    df = df.drop_duplicates(subset="zip_code", keep="first")
    return dict(zip(df["zip_code"], df["dma_description"]))


def _normalize_zip(raw: str) -> str:
    # handles zip+4 ("01001-1234") and zips that lost their leading zero
    # (common when a spreadsheet stores them as numbers)
    return str(raw).strip().split("-")[0].zfill(5)


def convert_zip_column_to_dma(
    df: pd.DataFrame, location_col: str, *, drop_unmapped: bool = False
) -> tuple[pd.DataFrame, list[str], int]:
    """Replaces `location_col`'s zip codes with their DMA name in place.

    Returns (converted_df, unmapped_zips, dropped_row_count).

    If any zip doesn't match the crosswalk and `drop_unmapped` is False (the
    default), converted_df is unchanged/unusable and the caller should
    surface `unmapped_zips` as a hard error rather than silently aggregating
    incomplete data. If `drop_unmapped` is True, rows with an unmapped zip
    are excluded instead, and `unmapped_zips`/`dropped_row_count` describe
    what was dropped so the caller can still report it, just not block on it.
    """
    crosswalk = _load_crosswalk()
    normalized = df[location_col].map(_normalize_zip)
    dma = normalized.map(crosswalk)
    unmapped_mask = dma.isna()

    if not unmapped_mask.any():
        df = df.copy()
        df[location_col] = dma
        return df, [], 0

    unmapped = sorted(set(normalized[unmapped_mask]))
    if not drop_unmapped:
        return df, unmapped, 0

    dropped_row_count = int(unmapped_mask.sum())
    df = df.loc[~unmapped_mask].copy()
    df[location_col] = dma.loc[~unmapped_mask]
    return df, unmapped, dropped_row_count


def aggregate_to_dma(df: pd.DataFrame, *, location_col: str, date_col: str, sum_cols: list[str]) -> pd.DataFrame:
    """Sums the given columns (Y + covariates) within each DMA/date pair,
    after convert_zip_column_to_dma has already replaced zips with DMA names.
    """
    other_cols = [c for c in df.columns if c not in {location_col, date_col, *sum_cols}]
    grouped = df.groupby([location_col, date_col], as_index=False)[sum_cols].sum()
    if other_cols:
        # keep the first value seen for any non-summed columns (e.g. an
        # already-DMA-level covariate) rather than dropping them
        extras = df.groupby([location_col, date_col], as_index=False)[other_cols].first()
        grouped = grouped.merge(extras, on=[location_col, date_col])
    return grouped
