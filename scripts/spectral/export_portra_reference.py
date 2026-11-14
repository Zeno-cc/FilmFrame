"""Export fixed Portra reference resources from a pinned, isolated checkout.

This maintenance-only script requires an isolated Python 3.13 environment with
NumPy 2.4.2, SciPy 1.17.1, colour-science 0.4.6 and spektrafilm's import-time
requirements. It is not a FilmFrame runtime dependency. Invoke Python with -I
from an owned working directory, never from a downloaded source directory.

Derived numeric code: GPL-3.0-or-later, based on spektrafilm by Andrea Volpato,
https://github.com/andreavolpato/spektrafilm (see accompanying NOTICE).
Profiles and their direct derived tables: CC BY-SA 4.0, Andrea Volpato.
Modified 2026-11-06 for the isolated FilmFrame numeric experiment: exported
fixed arrays and intermediates, no photographic parameters or measured samples
were edited. Hanatos/KG3 provenance remains unresolved; distribution is blocked.
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
EXPECTED_ENVIRONMENT = {
    "numpy": "2.4.2",
    "scipy": "1.17.1",
    "colour": "0.4.6",
}
EXPECTED_BASELINES = {
    "film_raw_portra_endura_gray_ramp16": (
        "8e7a7f72f3b14ce5cb473ff11fa5f1058a6a8e26054facaec1a0957ae17214fc",
        "b87f94120e376277a206962ad2c312446423c02b99a4cdea92f38d2cd80e55ff",
    ),
    "negative_density_portra_endura_gray_ramp16": (
        "05b3e914e9b24c0743a4042841379157ae4ed8752726fe55e027e6de786fd124",
        "4982e183186191ab89fbf03d6c7cc78d4e397fd0e296aebf2a1ec74fd0915d72",
    ),
    "print_rgb_portra_endura_gray_ramp16": (
        "4345814abe4c516618963c186a5c3f019eae01c7eec0654c25e0b93fff604311",
        "bcb82e8d714be8d62e21c3727e123c016a4c0fc3853b495153a6619bc91d5f8d",
    ),
    "print_rgb_portra_endura_green_patch8": (
        "a115fdebed2347f3106e6ec17e38fd3e3dd82721880b892507601595576b4399",
        "e1737ef99db2897fe69cc9f8704af7d348ebfca80997e49575d2be7d016fc961",
    ),
}
BASELINE_CASES = (
    "film_raw_portra_endura_gray_ramp16",
    "negative_density_portra_endura_gray_ramp16",
    "print_rgb_portra_endura_gray_ramp16",
    "print_rgb_portra_endura_green_patch8",
)
EXPECTED_PROFILES = {
    "kodak_portra_400": "b5cdc73dbec8f462f488bca70bedf23fd13ce79969c0457e8ac2a2565d92bf5d",
    "kodak_portra_endura": "e3bb6069e02d088d8080d38ce28035816038f62786e2aff9176bf4aeeb4820a0",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def payload_digest(array: np.ndarray) -> str:
    return hashlib.sha256(np.asarray(array, dtype=np.float64).tobytes(order="C")).hexdigest()


def packed(array: np.ndarray) -> dict[str, object]:
    values = np.asarray(array, dtype=np.float64)
    if not np.all(np.isfinite(values)):
        raise ValueError("Cannot export non-finite setup values")
    return {
        "shape": list(values.shape),
        "dtype": "float64",
        "order": "C",
        "values": values.reshape(-1).tolist(),
        "payloadSha256": payload_digest(values),
    }


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")


def export(upstream: Path, resources: Path, fixtures: Path) -> None:
    upstream = upstream.resolve()
    if upstream.name != f"spektrafilm-{EXPECTED_REVISION}":
        raise ValueError("The checkout directory must include the exact pinned revision")
    if not (upstream / "src/spektrafilm/runtime/pipeline.py").is_file():
        raise ValueError("Not a spektrafilm source checkout")

    import scipy

    for module, expected in EXPECTED_ENVIRONMENT.items():
        actual = {"numpy": np.__version__, "scipy": scipy.__version__, "colour": colour.__version__}[module]
        if actual != expected:
            raise RuntimeError(f"Expected {module}=={expected}, found {actual}")

    # These are explicit paths supplied by the maintainer, not cwd imports.
    sys.path.insert(0, str(upstream))
    sys.path.insert(0, str(upstream / "src"))
    from spektrafilm.config import STANDARD_OBSERVER_CMFS
    from spektrafilm.model.color_filters import color_enlarger
    from spektrafilm.model.couplers import (
        compute_density_curves_before_dir_couplers,
        compute_dir_couplers_matrix,
    )
    from spektrafilm.model.illuminants import standard_illuminant
    from spektrafilm.runtime.params_builder import digest_params, init_params
    from spektrafilm.runtime.pipeline import SimulationPipeline
    from spektrafilm.utils.gamut_compression import (
        OutputGamutCompressSpec,
        _get_output_c_max_table,
        _output_cs_whitepoint_xyz,
    )
    from spektrafilm.utils.spectral_upsampling import _illuminant_to_xy
    from tests.conftest import make_fast_test_params
    from tests.regression_baselines import build_case_image, find_case, load_baseline

    params = make_fast_test_params()
    # Measured configuration drift: the committed print fixtures use OkLch,
    # not the current default CAM16-UCS; see the task provenance record.
    params.io.output_gamut_compress = OutputGamutCompressSpec(algorithm="oklch")
    pipeline = SimulationPipeline(params)
    film = pipeline._filming_stage
    printing = pipeline._printing_stage
    scanning = pipeline._scanning_stage
    film_profile = pipeline.film
    paper_profile = pipeline.print
    sensitivity = np.nan_to_num(10 ** film_profile.data.log_sensitivity)
    tc_lut = pipeline._lut_service.get_filming_tc_lut(sensitivity)
    if tc_lut.shape != (192, 192, 3):
        raise RuntimeError(f"Unexpected TC shape {tc_lut.shape}")

    normalized_curves = film_profile.data.density_curves - np.nanmin(
        film_profile.data.density_curves, axis=0
    )
    dir_matrix = compute_dir_couplers_matrix(pipeline.film_render.dir_couplers)
    dir_matrix *= pipeline.film_render.dir_couplers.amount
    dir_curves = compute_density_curves_before_dir_couplers(
        normalized_curves, film_profile.data.log_exposure, dir_matrix, positive=False
    )
    from spektrafilm.utils.morph_curves import apply_print_curves_morph

    film_spectral_valid = np.isfinite(film_profile.data.base_density) & np.isfinite(film_profile.data.channel_density).all(axis=1)
    paper_spectral_valid = np.isfinite(paper_profile.data.base_density) & np.isfinite(paper_profile.data.channel_density).all(axis=1)
    if not film_spectral_valid.any() or not paper_spectral_valid.any():
        raise ValueError('No finite spectral measurements')
    # Upstream density_to_light zeroes any wavelength whose base/channel
    # density is NaN. NaN-to-zero at export must therefore be paired with an
    # explicit complete-measurement mask, not treated as a valid zero density.
    paper_curves = apply_print_curves_morph(
        paper_profile.data.log_exposure,
        paper_profile.data.density_curves_model,
        pipeline.print_render.density_curves_morph,
        profile_type=paper_profile.info.type,
    )
    enlarger = standard_illuminant(pipeline.enlarger.illuminant)
    filtered_enlarger = pipeline._enlarger_service.enlarger_filtered_illuminant(enlarger)
    d50 = standard_illuminant(paper_profile.info.viewing_illuminant)
    d55_xy = _illuminant_to_xy(film_profile.info.reference_illuminant)
    d50_xyz = np.einsum("k,kl->l", d50, STANDARD_OBSERVER_CMFS[:])
    d50_xyz /= np.sum(d50 * STANDARD_OBSERVER_CMFS[:, 1])
    d50_xy = colour.XYZ_to_xy(d50_xyz)
    cmax_l, cmax_h, cmax = _get_output_c_max_table("oklch", "sRGB")
    setup = {
        "schema": 1,
        "source": {
            "project": "spektrafilm by Andrea Volpato",
            "url": "https://github.com/andreavolpato/spektrafilm",
            "revision": EXPECTED_REVISION,
            "codeLicense": "GPL-3.0-or-later",
            "profileLicense": "CC BY-SA 4.0",
            "colourScience": "0.4.6 (BSD-3-Clause)",
            "redistribution": "BLOCKED: Hanatos irradiance and measured KG3 provenance unresolved",
        },
        "configuration": {
            "inputColorSpace": "ProPhoto RGB",
            "inputCctfDecoding": False,
            "outputColorSpace": "sRGB",
            "outputCctfEncoding": True,
            "wavelengthCount": 81,
            "enlargerCcmY": [
                pipeline.enlarger.c_filter_neutral,
                pipeline.enlarger.m_filter_neutral,
                pipeline.enlarger.y_filter_neutral,
            ],
            "printExposure": pipeline.enlarger.print_exposure,
            "midGray": 0.184,
            "outputGamutAlgorithm": "oklch",
            "outputGamutKnee": [0.0, 1.0, 6.0],
            "outputLightnessKnee": [0.7, 1.0, 2.2],
        },
        "arrays": {
            "filmTcLut": packed(tc_lut),
            "filmLogExposure": packed(film_profile.data.log_exposure),
            "filmNormalizedCurves": packed(normalized_curves),
            "filmRawCurves": packed(film_profile.data.density_curves),
            "filmDirCurves": packed(dir_curves),
            "filmDirMatrix": packed(dir_matrix),
            "filmLogSensitivity": packed(np.nan_to_num(film_profile.data.log_sensitivity)),
            "filmChannelDensity": packed(np.nan_to_num(film_profile.data.channel_density)),
            "filmBaseDensity": packed(np.nan_to_num(film_profile.data.base_density)),
            "filmSpectralValidMask": packed(film_spectral_valid.astype(np.float64)),
            "paperSpectralValidMask": packed(paper_spectral_valid.astype(np.float64)),
            "paperLogExposure": packed(paper_profile.data.log_exposure),
            "paperFittedCurves": packed(paper_curves),
            "paperLogSensitivity": packed(np.nan_to_num(paper_profile.data.log_sensitivity)),
            "paperChannelDensity": packed(np.nan_to_num(paper_profile.data.channel_density)),
            "paperBaseDensity": packed(np.nan_to_num(paper_profile.data.base_density)),
            "filteredEnlarger": packed(filtered_enlarger),
            "d50": packed(d50),
            "cmfs": packed(STANDARD_OBSERVER_CMFS[:]),
            "proPhotoToXyzD55Cat16": packed(
                colour.adaptation.matrix_chromatic_adaptation_VonKries(
                    colour.xy_to_XYZ(colour.RGB_COLOURSPACES["ProPhoto RGB"].whitepoint),
                    colour.xy_to_XYZ(d55_xy),
                    transform="CAT16",
                ) @ colour.RGB_COLOURSPACES["ProPhoto RGB"].matrix_RGB_to_XYZ
            ),
            "srgbToProPhoto": packed(
                colour.models.matrix_RGB_to_RGB("sRGB", "ProPhoto RGB")
            ),
            "xyzD50ToSrgbCat02": packed(
                colour.RGB_COLOURSPACES["sRGB"].matrix_XYZ_to_RGB
                @ colour.adaptation.matrix_chromatic_adaptation_VonKries(
                    colour.xy_to_XYZ(d50_xy),
                    colour.xy_to_XYZ(colour.RGB_COLOURSPACES["sRGB"].whitepoint),
                    transform="CAT02",
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

    manifest = {
        "schema": 1,
        "sourceRevision": EXPECTED_REVISION,
        "environment": {"python": sys.version.split()[0], **EXPECTED_ENVIRONMENT},
        "baselineTolerance": {"rtol": 1.5e-3, "atol": 1e-6},
        "baselines": {},
        "intermediates": {},
    }
    for case_id in BASELINE_CASES:
        case = find_case(case_id)
        image = build_case_image(case.image_recipe)
        expected = load_baseline(case_id)
        source_path = upstream / "tests/baselines" / f"{case_id}.npz"
        actual_npz_digest, actual_payload_digest = EXPECTED_BASELINES[case_id]
        if sha256(source_path) != actual_npz_digest:
            raise RuntimeError(f"Pinned baseline digest changed: {case_id}")
        if payload_digest(expected) != actual_payload_digest:
            raise RuntimeError(f"Pinned baseline payload changed: {case_id}")
        expected_npy = fixtures / f"{case_id}.npy"
        np.save(expected_npy, expected, allow_pickle=False)
        (fixtures / f"{case_id}.npz").write_bytes(source_path.read_bytes())
        manifest["baselines"][case_id] = {
            "npzSha256": actual_npz_digest,
            "outputPayloadSha256": actual_payload_digest,
            "shape": list(expected.shape),
            "dtype": str(expected.dtype),
            "order": "C",
            "npySha256": sha256(expected_npy),
            "recipe": case.image_recipe,
        }
        recipe = case.image_recipe
        stage_results = {
            "filmRaw": pipeline.process(image, collect="log_e_film"),
            "negativeDensity": pipeline.process(image, collect="cmy_film"),
            "paperLogExposure": pipeline.process(image, collect="log_e_print"),
            "paperDensity": pipeline.process(image, collect="cmy_print"),
        }
        stage_results["printRgb"] = pipeline.process(image)
        for stage, output in stage_results.items():
            intermediate_id = f"{recipe}.{stage}"
            path = fixtures / f"{intermediate_id}.npy"
            np.save(path, np.asarray(output, dtype=np.float64), allow_pickle=False)
            manifest["intermediates"][intermediate_id] = {
                "shape": list(output.shape),
                "dtype": "float64",
                "order": "C",
                "npySha256": sha256(path),
                "outputPayloadSha256": payload_digest(output),
            }
        baseline_stage = {
            "film_raw": "filmRaw",
            "negative_density": "negativeDensity",
            "print_rgb": "printRgb",
        }[case.output_mode]
        actual = np.asarray(stage_results[baseline_stage], dtype=np.float64)
        difference = np.abs(actual - expected)
        tolerance = 1e-6 + 1.5e-3 * np.abs(expected)
        manifest["baselines"][case_id]["recomputed"] = {
            "algorithm": "oklch" if case.output_mode == "print_rgb" else "not-applicable",
            "passes": bool(np.all(difference <= tolerance)),
            "maxAbs": float(np.max(difference)),
            "meanAbs": float(np.mean(difference)),
            "violations": int(np.count_nonzero(difference > tolerance)),
        }

    for profile, expected_digest in EXPECTED_PROFILES.items():
        source = upstream / "src/spektrafilm/data/profiles" / f"{profile}.json"
        if sha256(source) != expected_digest:
            raise RuntimeError(f"Pinned profile digest changed: {profile}")
        (resources / f"{profile}.json").write_bytes(source.read_bytes())
        manifest[f"{profile}Sha256"] = expected_digest
    write_json(resources / "portra-setup.json", setup)
    write_json(fixtures / "manifest.json", manifest)
    print(f"Exported fixed setup to {resources / 'portra-setup.json'}")
    print(f"Exported {len(BASELINE_CASES)} pinned baselines and 8 intermediate arrays to {fixtures}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", required=True, type=Path)
    parser.add_argument("--resources", required=True, type=Path)
    parser.add_argument("--fixtures", required=True, type=Path)
    args = parser.parse_args()
    args.resources.mkdir(parents=True, exist_ok=True)
    args.fixtures.mkdir(parents=True, exist_ok=True)
    export(args.upstream, args.resources, args.fixtures)


if __name__ == "__main__":
    main()
