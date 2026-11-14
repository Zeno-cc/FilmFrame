"""Export data-driven negative-film/paper resources and reference stages.

Maintenance-only GPL-3.0-or-later derived work based on spektrafilm by Andrea
Volpato. Profiles and direct profile derivatives are CC BY-SA 4.0. Invoke
Python with -I and explicit paths outside the downloaded checkout.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import colour
import numpy as np

EXPECTED_REVISION = "3bb2c2d2801ff68b92019cf1dbcbb133d60832bc"
PAIRS = {
    "kodak_portra_400": ("b5cdc73dbec8f462f488bca70bedf23fd13ce79969c0457e8ac2a2565d92bf5d", "kodak_portra_endura"),
    "kodak_portra_160": ("1bc9b65a6940f3a4381e8d14d0ac43594aff9495051992ce4d7408e761549992", "kodak_portra_endura"),
    "kodak_portra_800": ("5b0c6e861c6273a2ecdf552525e80738037918e650a0dc206e095acfd02f8b43", "kodak_portra_endura"),
    "kodak_gold_200": ("aa8a0c1c7851fface3752f968cdf6c6d74a26fc9756a4460d3155d2382506b7c", "kodak_portra_endura"),
    "kodak_ektar_100": ("60acbd46c75005771569eafb97f534a4495e9d4e1e9c1e419b90cea2676ec7cf", "kodak_portra_endura"),
    "kodak_ultramax_400": ("248b78bdcc4fdbe864e30f193f900059ecd98cbdb276c88ad8f6f5b520137901", "kodak_portra_endura"),
    "fujifilm_c200": ("30db07d88090aadc62e03d18c2c51f67a20a1673390c69f99933b7ed5406d2c8", "fujifilm_crystal_archive_typeii"),
    "fujifilm_xtra_400": ("5f2a3642c7c8db5e750d7366c34b47d24b89ad78d2abe41da4b5282fd4286e58", "fujifilm_crystal_archive_typeii"),
    "fujifilm_pro_400h": ("da1be731ab79fb5535c43042494fa7298c942179abb68270b928aa012c629b31", "fujifilm_crystal_archive_typeii"),
    "kodak_vision3_50d": ("fd426abc9de911682080db222020978dee4e8df7ca939bfcd5c9d0f6df249fa1", "kodak_2383"),
    "kodak_vision3_200t": ("4a28f049fd6bad67be98efdb058b413c6b3c022e2932b357b346d902c4c393c8", "kodak_2383"),
    "kodak_vision3_250d": ("9ab85c8627c0533beb925b747e441e93beabe9e98c2429695b0a53866b56fcc7", "kodak_2383"),
    "kodak_vision3_500t": ("d7beca68bf16db88dbb7373fd13a6a1150a57a911a54bb0309a760a6f9883329", "kodak_2383"),
}
PAPER_HASHES = {
    "kodak_portra_endura": "e3bb6069e02d088d8080d38ce28035816038f62786e2aff9176bf4aeeb4820a0",
    "fujifilm_crystal_archive_typeii": "0db98e5b8e2ed5248696e62bc39b7f21459a8812d64049b1275d7be995af873b",
    "kodak_2383": "eb7fdfa3b75a909bf5c400802f7401160c8017ed1ac3e8e0d1c8448d56fbe184",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def payload_digest(array: np.ndarray) -> str:
    return hashlib.sha256(np.asarray(array, dtype=np.float64).tobytes(order="C")).hexdigest()


def packed(array: np.ndarray) -> dict[str, object]:
    values = np.asarray(array, dtype=np.float64)
    if not np.all(np.isfinite(values)):
        raise ValueError("Cannot export non-finite values")
    return {
        "shape": list(values.shape), "dtype": "float64", "order": "C",
        "values": values.reshape(-1).tolist(), "payloadSha256": payload_digest(values),
    }


def export_pair(upstream: Path, film_id: str, paper_id: str, resources: Path, fixtures: Path) -> dict:
    from spektrafilm.config import STANDARD_OBSERVER_CMFS
    from spektrafilm.model.couplers import compute_density_curves_before_dir_couplers, compute_dir_couplers_matrix
    from spektrafilm.model.illuminants import standard_illuminant
    from spektrafilm.runtime.pipeline import SimulationPipeline
    from spektrafilm.utils.gamut_compression import OutputGamutCompressSpec, _get_output_c_max_table, _output_cs_whitepoint_xyz
    from spektrafilm.utils.spectral_upsampling import _illuminant_to_xy
    from spektrafilm.utils.morph_curves import apply_print_curves_morph
    from tests.conftest import make_fast_test_params
    from tests.regression_baselines import build_case_image

    expected_hash, declared_paper = PAIRS[film_id]
    if declared_paper != paper_id:
        raise ValueError(f"Unexpected paper {paper_id} for {film_id}")
    source = upstream / "src/spektrafilm/data/profiles" / f"{film_id}.json"
    paper_source = upstream / "src/spektrafilm/data/profiles" / f"{paper_id}.json"
    if sha256(source) != expected_hash or sha256(paper_source) != PAPER_HASHES[paper_id]:
        raise ValueError("Pinned profile digest mismatch")
    params = make_fast_test_params(film_profile=film_id, print_profile=paper_id)
    params.io.output_gamut_compress = OutputGamutCompressSpec(algorithm="oklch")
    pipeline = SimulationPipeline(params)
    film = pipeline.film
    paper = pipeline.print
    if film.info.type != "negative" or film.info.support != "film" or film.info.stage != "filming":
        raise ValueError(f"Not a camera negative: {film_id}")
    if paper.info.type != "negative" or paper.info.support not in {"paper", "film"} or paper.info.stage != "printing":
        raise ValueError(f"Not a print-stage destination: {paper_id}")
    sensitivity = np.nan_to_num(10 ** film.data.log_sensitivity)
    tc_lut = pipeline._lut_service.get_filming_tc_lut(sensitivity)
    if tc_lut.shape != (192, 192, 3):
        raise ValueError("Unexpected TC LUT shape")
    normalized = film.data.density_curves - np.nanmin(film.data.density_curves, axis=0)
    matrix = compute_dir_couplers_matrix(pipeline.film_render.dir_couplers)
    matrix *= pipeline.film_render.dir_couplers.amount
    dir_curves = compute_density_curves_before_dir_couplers(normalized, film.data.log_exposure, matrix, positive=False)
    film_valid = np.isfinite(film.data.base_density) & np.isfinite(film.data.channel_density).all(axis=1)
    paper_valid = np.isfinite(paper.data.base_density) & np.isfinite(paper.data.channel_density).all(axis=1)
    if not film_valid.any() or not paper_valid.any():
        raise ValueError("No valid spectral measurements")
    paper_curves = apply_print_curves_morph(paper.data.log_exposure, paper.data.density_curves_model, pipeline.print_render.density_curves_morph, profile_type=paper.info.type)
    enlarger = standard_illuminant(pipeline.enlarger.illuminant)
    filtered = pipeline._enlarger_service.enlarger_filtered_illuminant(enlarger)
    viewing = standard_illuminant(paper.info.viewing_illuminant)
    reference_xy = _illuminant_to_xy(film.info.reference_illuminant)
    viewing_xyz = np.einsum("k,kl->l", viewing, STANDARD_OBSERVER_CMFS[:])
    viewing_xyz /= np.sum(viewing * STANDARD_OBSERVER_CMFS[:, 1])
    viewing_xy = colour.XYZ_to_xy(viewing_xyz)
    cmax_l, cmax_h, cmax = _get_output_c_max_table("oklch", "sRGB")
    setup = {
        "schema": 1,
        "source": {
            "revision": EXPECTED_REVISION,
            "redistribution": "BLOCKED: Hanatos irradiance and measured KG3 provenance unresolved",
        },
        "configuration": {
            "inputColorSpace": "ProPhoto RGB",
            "outputColorSpace": "sRGB",
            "wavelengthCount": 81,
            "outputGamutAlgorithm": "oklch",
            "filmId": film_id,
            "paperId": paper_id,
            "referenceIlluminant": film.info.reference_illuminant,
            "viewingIlluminant": paper.info.viewing_illuminant,
        },
        "arrays": {
            "filmTcLut": packed(tc_lut),
            "filmLogExposure": packed(film.data.log_exposure),
            "filmNormalizedCurves": packed(normalized),
            "filmRawCurves": packed(film.data.density_curves),
            "filmDirCurves": packed(dir_curves),
            "filmDirMatrix": packed(matrix),
            "filmLogSensitivity": packed(np.nan_to_num(film.data.log_sensitivity)),
            "filmChannelDensity": packed(np.nan_to_num(film.data.channel_density)),
            "filmBaseDensity": packed(np.nan_to_num(film.data.base_density)),
            "filmSpectralValidMask": packed(film_valid.astype(np.float64)),
            "paperLogExposure": packed(paper.data.log_exposure),
            "paperFittedCurves": packed(paper_curves),
            "paperLogSensitivity": packed(np.nan_to_num(paper.data.log_sensitivity)),
            "paperChannelDensity": packed(np.nan_to_num(paper.data.channel_density)),
            "paperBaseDensity": packed(np.nan_to_num(paper.data.base_density)),
            "paperSpectralValidMask": packed(paper_valid.astype(np.float64)),
            "filteredEnlarger": packed(filtered),
            "d50": packed(viewing),
            "cmfs": packed(STANDARD_OBSERVER_CMFS[:]),
            "proPhotoToXyzD55Cat16": packed(
                colour.adaptation.matrix_chromatic_adaptation_VonKries(
                    colour.xy_to_XYZ(colour.RGB_COLOURSPACES["ProPhoto RGB"].whitepoint),
                    colour.xy_to_XYZ(reference_xy), transform="CAT16",
                ) @ colour.RGB_COLOURSPACES["ProPhoto RGB"].matrix_RGB_to_XYZ
            ),
            "srgbToProPhoto": packed(colour.models.matrix_RGB_to_RGB("sRGB", "ProPhoto RGB")),
            "xyzD50ToSrgbCat02": packed(
                colour.RGB_COLOURSPACES["sRGB"].matrix_XYZ_to_RGB
                @ colour.adaptation.matrix_chromatic_adaptation_VonKries(
                    colour.xy_to_XYZ(viewing_xy), colour.xy_to_XYZ(colour.RGB_COLOURSPACES["sRGB"].whitepoint), transform="CAT02",
                )
            ),
            "srgbToXyz": packed(colour.RGB_COLOURSPACES["sRGB"].matrix_RGB_to_XYZ),
            "xyzToSrgb": packed(colour.RGB_COLOURSPACES["sRGB"].matrix_XYZ_to_RGB),
            "xyzWhiteSrgb": packed(_output_cs_whitepoint_xyz("sRGB")),
            "cam16LGrid": packed(cmax_l),
            "cam16HGrid": packed(cmax_h),
            "cam16Cmax": packed(cmax),
            "oklabXyzToLms": packed(colour.models.oklab.MATRIX_1_XYZ_TO_LMS),
            "oklabLmsToXyz": packed(colour.models.oklab.MATRIX_1_LMS_TO_XYZ),
            "oklabLmsToLab": packed(colour.models.oklab.MATRIX_2_LMS_TO_LAB),
            "oklabLabToLms": packed(colour.models.oklab.MATRIX_2_LAB_TO_LMS),
        },
    }
    resources.mkdir(parents=True, exist_ok=True)
    fixtures.mkdir(parents=True, exist_ok=True)
    (resources / f"{film_id}.json").write_bytes(source.read_bytes())
    (resources / f"{paper_id}.json").write_bytes(paper_source.read_bytes())
    (resources / f"{film_id}-setup.json").write_text(json.dumps(setup, indent=2, allow_nan=False) + "\n")
    result = {"filmId": film_id, "paperId": paper_id, "setupSha256": sha256(resources / f"{film_id}-setup.json"), "stages": {}}
    for recipe in ["gray_ramp_16", "green_patch_8"]:
        image = build_case_image(recipe)
        for stage, tap in [("filmRaw", "log_e_film"), ("negativeDensity", "cmy_film"), ("paperLogExposure", "log_e_print"), ("paperDensity", "cmy_print")]:
            actual = np.asarray(pipeline.process(image, collect=tap), dtype=np.float64)
            path = fixtures / f"{film_id}-{recipe}-{stage}.npy"
            np.save(path, actual, allow_pickle=False)
            result["stages"][f"{recipe}.{stage}"] = {"sha256": sha256(path), "payloadSha256": payload_digest(actual), "shape": list(actual.shape)}
        actual = np.asarray(pipeline.process(image), dtype=np.float64)
        path = fixtures / f"{film_id}-{recipe}-printRgb.npy"
        np.save(path, actual, allow_pickle=False)
        result["stages"][f"{recipe}.printRgb"] = {"sha256": sha256(path), "payloadSha256": payload_digest(actual), "shape": list(actual.shape)}
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", required=True, type=Path)
    parser.add_argument("--film", required=True, choices=list(PAIRS))
    parser.add_argument("--paper", required=True)
    parser.add_argument("--resources", required=True, type=Path)
    parser.add_argument("--fixtures", required=True, type=Path)
    args = parser.parse_args()
    upstream = args.upstream.resolve()
    if upstream.name != f"spektrafilm-{EXPECTED_REVISION}":
        raise ValueError("Upstream must match pinned revision")
    sys.path.insert(0, str(upstream))
    sys.path.insert(0, str(upstream / "src"))
    print(json.dumps(export_pair(upstream, args.film, args.paper, args.resources, args.fixtures), indent=2))


if __name__ == "__main__":
    main()
