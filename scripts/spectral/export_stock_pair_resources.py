"""Export and validate exact negative-film/paper setups from pinned spektrafilm.

Run this maintenance script with Python ``-I``, explicit absolute paths, and an
owned working directory outside both this repository and the downloaded source.
It deliberately supports only the checked D55/D50 color-negative pairs below.
No runtime registry, UI, global provenance manifest, or Vision3 setup is changed.

Derived numeric code: GPL-3.0-or-later, based on spektrafilm by Andrea Volpato,
https://github.com/andreavolpato/spektrafilm. Profiles and their direct derived
tables: CC BY-SA 4.0, Andrea Volpato. Modified 2026-11-06 for FilmFrame's local
controlled research: exported exact per-pair arrays/intermediates and added
array-driven numerical checks; no measured photographic data were retuned.
Hanatos/KG3 provenance remains unresolved; public redistribution is blocked.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import math
import platform
import sys
from pathlib import Path

import colour
import numpy as np

EXPECTED_REVISION = "3bb2c2d2801ff68b92019cf1dbcbb133d60832bc"
EXPECTED_ENVIRONMENT = {"numpy": "2.4.2", "scipy": "1.17.1", "colour": "0.4.6"}
PROFILE_PAIRS = (
    ("kodak_portra_160", "kodak_portra_endura", "replace-look"),
    ("kodak_portra_400", "kodak_portra_endura", "compatibility-fixture"),
    ("kodak_portra_800", "kodak_portra_endura", "replace-look"),
    ("kodak_portra_800_push1", "kodak_portra_endura", "add"),
    ("kodak_portra_800_push2", "kodak_portra_endura", "add"),
    ("kodak_gold_200", "kodak_portra_endura", "replace-look"),
    ("kodak_ektar_100", "kodak_portra_endura", "replace-look"),
    ("kodak_ultramax_400", "kodak_portra_endura", "replace-look"),
    ("fujifilm_c200", "fujifilm_crystal_archive_typeii", "add"),
    ("fujifilm_xtra_400", "fujifilm_crystal_archive_typeii", "add"),
    ("fujifilm_pro_400h", "fujifilm_crystal_archive_typeii", "add"),
)
EXPECTED_PROFILES = {
    "fujifilm_c200": "30db07d88090aadc62e03d18c2c51f67a20a1673390c69f99933b7ed5406d2c8",
    "fujifilm_pro_400h": "da1be731ab79fb5535c43042494fa7298c942179abb68270b928aa012c629b31",
    "fujifilm_xtra_400": "5f2a3642c7c8db5e750d7366c34b47d24b89ad78d2abe41da4b5282fd4286e58",
    "kodak_ektar_100": "60acbd46c75005771569eafb97f534a4495e9d4e1e9c1e419b90cea2676ec7cf",
    "kodak_gold_200": "aa8a0c1c7851fface3752f968cdf6c6d74a26fc9756a4460d3155d2382506b7c",
    "kodak_portra_160": "1bc9b65a6940f3a4381e8d14d0ac43594aff9495051992ce4d7408e761549992",
    "kodak_portra_400": "b5cdc73dbec8f462f488bca70bedf23fd13ce79969c0457e8ac2a2565d92bf5d",
    "kodak_portra_800": "5b0c6e861c6273a2ecdf552525e80738037918e650a0dc206e095acfd02f8b43",
    "kodak_portra_800_push1": "dac9cbcd2442442d9dee90bd2d6a28dcc4b996635dcac0b44ac8ecd32c4b3a4f",
    "kodak_portra_800_push2": "5ee01e4a00c157721738314313a43b46fcd5dae62ed3a7e4730f9054b66f6282",
    "kodak_ultramax_400": "248b78bdcc4fdbe864e30f193f900059ecd98cbdb276c88ad8f6f5b520137901",
    "kodak_portra_endura": "e3bb6069e02d088d8080d38ce28035816038f62786e2aff9176bf4aeeb4820a0",
    "fujifilm_crystal_archive_typeii": "0db98e5b8e2ed5248696e62bc39b7f21459a8812d64049b1275d7be995af873b",
}
EXPECTED_CODE_FILES = {
    "tests/conftest.py": "6e3a63720c4937a22cfd622c88b9a56033c99b535fcdafe99eaf90b40c1e55e8",
    "src/spektrafilm/runtime/pipeline.py": "22d3772529270f936363ddfc5ae8f30e4ee2fa2a8d562ef359242d6de728f4e8",
    "src/spektrafilm/runtime/params_builder.py": "edc4537e2b1e021eea4a46e746550185525f9bcc25610ae577f936ad513d99c2",
    "src/spektrafilm/runtime/params_schema.py": "3373d4cbc31476041dd5ae071ff00445313ac1a2d9d5e3517cf13dc5e87e18fa",
    "src/spektrafilm/runtime/stages/filming.py": "e5f7acc4a5d90b1452ff08cb8aee13dbeb28d08e9c6a31eff4471df5dcc6aa3e",
    "src/spektrafilm/runtime/stages/printing.py": "6d47514f230c65ed60b0012be93277057bac4d3dd16089123aaa0ce99c0a25b0",
    "src/spektrafilm/runtime/stages/scanning.py": "30078ef985e731b4b0150ed310ec1e2870fc6f7e037f5876c9afa2188b2cc99f",
    "src/spektrafilm/model/develop.py": "41dfe710e89188dcdc87b5ad87c56095efa44f3dbc9393095f95762e2c1d0c83",
    "src/spektrafilm/model/couplers.py": "706a1832cdfa0399b45e9a246b4c29ef669d42bf4d679080fb0346cf6ec5fcf3",
    "src/spektrafilm/model/color_filters.py": "175aa801e228484880805e84af66bf1005fe916860fa4c36b955b4f5967579a7",
    "src/spektrafilm/model/illuminants.py": "757608544bd603bfcf26db24c70d84ec9618569fb26bdfe6bf4e7362b62e4676",
    "src/spektrafilm/utils/spectral_upsampling.py": "6c51273383c6aa5538c3c742dfd46a6660300c8211936bfbbc498c64e60ef6ea",
    "src/spektrafilm/utils/gamut_compression.py": "4f7e6b48f8fd582c5ed3bb9559cf55a2c32be8b637cf90532b7979719fd13924",
    "src/spektrafilm/utils/morph_curves.py": "f082d40c69f8f8c70f4d94ae947becf907609f2f56426c2fa7b9dd3006d4a6c9",
    "src/spektrafilm/utils/fast_interp_lut.py": "520c649ee63c4131ac178b45f363dc6e83130a5c0b03dc259d46347dabbe4e2f",
}
EXPECTED_FILTER_SHA256 = "8bbf8d8db76aecdc9e94bc0b1e31f3329553eeda56d210ab36294fa5e4bf3b13"
EXPECTED_TABLES = {
    "src/spektrafilm/data/luts/spectral_upsampling/irradiance_xy_tc.npy": "52f90c724811f5fab80769f8548bf24d08a521eb09e65ab6e016893258d2a783",
    "src/spektrafilm/data/filters/heat_absorbing/schott/KG3.csv": "7654aa57fa8e42ae280e8d679ae9ebf8cef48ed5cbe6c2ab43eba1c6608f3d1f",
}
EXPECTED_COMPATIBILITY_BASELINES = {
    "film_raw_portra_endura_gray_ramp16": (
        "8e7a7f72f3b14ce5cb473ff11fa5f1058a6a8e26054facaec1a0957ae17214fc",
        "b87f94120e376277a206962ad2c312446423c02b99a4cdea92f38d2cd80e55ff", True, 0,
    ),
    "negative_density_portra_endura_gray_ramp16": (
        "05b3e914e9b24c0743a4042841379157ae4ed8752726fe55e027e6de786fd124",
        "4982e183186191ab89fbf03d6c7cc78d4e397fd0e296aebf2a1ec74fd0915d72", True, 0,
    ),
    "print_rgb_portra_endura_gray_ramp16": (
        "4345814abe4c516618963c186a5c3f019eae01c7eec0654c25e0b93fff604311",
        "bcb82e8d714be8d62e21c3727e123c016a4c0fc3853b495153a6619bc91d5f8d", False, 48,
    ),
    "print_rgb_portra_endura_green_patch8": (
        "a115fdebed2347f3106e6ec17e38fd3e3dd82721880b892507601595576b4399",
        "e1737ef99db2897fe69cc9f8704af7d348ebfca80997e49575d2be7d016fc961", True, 0,
    ),
}
TOLERANCES = {
    "filmRaw": {"atol": 2e-8, "rtol": 2e-9},
    "negativeDensity": {"atol": 2e-8, "rtol": 2e-9},
    "paperLogExposure": {"atol": 2e-8, "rtol": 2e-9},
    "paperDensity": {"atol": 5e-8, "rtol": 5e-9},
    "printRgb": {"atol": 1e-7, "rtol": 1e-8},
}
LEGACY_ARRAYS = (
    "filmTcLut", "filmLogExposure", "filmNormalizedCurves", "filmRawCurves", "filmDirCurves",
    "filmDirMatrix", "filmLogSensitivity", "filmChannelDensity", "filmBaseDensity",
    "filmSpectralValidMask", "paperSpectralValidMask", "paperLogExposure", "paperFittedCurves",
    "paperLogSensitivity", "paperChannelDensity", "paperBaseDensity", "filteredEnlarger", "d50",
    "cmfs", "proPhotoToXyzD55Cat16", "xyzD50ToSrgbCat02", "srgbToProPhoto", "srgbToXyz",
    "xyzToSrgb", "xyzWhiteSrgb", "cam16LGrid", "cam16HGrid", "cam16Cmax", "oklabXyzToLms",
    "oklabLmsToXyz", "oklabLmsToLab", "oklabLabToLms",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def payload_digest(array: np.ndarray) -> str:
    return hashlib.sha256(np.asarray(array, dtype=np.float64).tobytes(order="C")).hexdigest()


def packed(array: np.ndarray) -> dict[str, object]:
    values = np.asarray(array, dtype=np.float64)
    if not np.all(np.isfinite(values)):
        raise ValueError("Cannot export non-finite setup values")
    return {
        "shape": list(values.shape), "dtype": "float64", "order": "C",
        "values": values.reshape(-1).tolist(), "payloadSha256": payload_digest(values),
    }


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, indent=2, allow_nan=False) + "\n").encode("utf-8")


def write_bytes(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value)
    if sha256(path) != hashlib.sha256(value).hexdigest():
        raise RuntimeError(f"Output digest mismatch: {path}")


def difference(actual: np.ndarray, expected: np.ndarray, tolerance: dict[str, float]) -> dict[str, object]:
    actual = np.asarray(actual, dtype=np.float64)
    expected = np.asarray(expected, dtype=np.float64)
    if actual.shape != expected.shape or not np.all(np.isfinite(actual)) or not np.all(np.isfinite(expected)):
        raise ValueError("Non-finite values or incompatible fixture dimensions")
    delta = np.abs(actual - expected)
    allowed = tolerance["atol"] + tolerance["rtol"] * np.abs(expected)
    violations = int(np.count_nonzero(delta > allowed))
    return {
        "passes": violations == 0, "violations": violations,
        "maxAbs": float(np.max(delta)), "meanAbs": float(np.mean(delta)),
        "atol": tolerance["atol"], "rtol": tolerance["rtol"],
        "elementCount": int(delta.size),
    }


def profile_metadata(upstream: Path, profile_id: str, role: str) -> tuple[Path, dict[str, object]]:
    path = upstream / "src/spektrafilm/data/profiles" / f"{profile_id}.json"
    if sha256(path) != EXPECTED_PROFILES[profile_id]:
        raise RuntimeError(f"Pinned profile digest changed: {profile_id}")
    document = json.loads(path.read_text())
    info = document["info"]
    expected = ("negative", "film", "filming") if role == "film" else ("negative", "paper", "printing")
    if (info["type"], info["support"], info["stage"]) != expected or info["stock"] != profile_id:
        raise ValueError(f"Invalid {role} role for {profile_id}: {info}")
    if info["channel_model"] != "color":
        raise ValueError(f"Unsupported channel model for {profile_id}")
    data = document["data"]
    shapes = {
        "wavelengths": (81,), "log_sensitivity": (81, 3), "channel_density": (81, 3),
        "base_density": (81,), "log_exposure": (256,), "density_curves": (256, 3),
    }
    for name, shape in shapes.items():
        if np.asarray(data[name]).shape != shape:
            raise ValueError(f"Unexpected {profile_id} {name} shape: {np.asarray(data[name]).shape}")
    if role == "film" and np.asarray(data["hanatos2025_adaptation_window_params"]).shape != (4,):
        raise ValueError(f"Missing exact Hanatos window for {profile_id}")
    return path, {"name": info["name"], "role": {key: info[key] for key in ("type", "support", "stage")},
                  "use": info["use"], "antihalation": info["antihalation"],
                  "channelModel": info["channel_model"], "sha256": EXPECTED_PROFILES[profile_id]}


def validate_source(upstream: Path) -> dict[str, str]:
    upstream = upstream.resolve()
    if upstream.name != f"spektrafilm-{EXPECTED_REVISION}":
        raise ValueError("The checkout directory must include the exact pinned revision")
    if not (upstream / "src/spektrafilm/runtime/pipeline.py").is_file():
        raise ValueError("Not a spektrafilm source checkout")
    for relative, expected in {**EXPECTED_CODE_FILES, **EXPECTED_TABLES}.items():
        if sha256(upstream / relative) != expected:
            raise RuntimeError(f"Pinned source digest changed: {relative}")
    return {relative: sha256(upstream / relative) for relative in EXPECTED_CODE_FILES}


def decode_srgb(values: np.ndarray) -> np.ndarray:
    return np.where(values <= 0.04045, values / 12.92, ((values + 0.055) / 1.055) ** 2.4)


def fixture_images(srgb_to_prophoto: np.ndarray) -> dict[str, np.ndarray]:
    ramp = np.linspace(0.01, 1.0, 16)
    gray = np.ones((16, 16, 3), dtype=np.float64) * ramp[None, :, None]
    green = np.tile(np.array([0.05, 0.40, 0.05]), (8, 8, 1))
    palette = np.array([[238, 217, 198], [32, 43, 62], [128, 128, 128], [248, 248, 241],
                        [18, 110, 71], [178, 59, 42], [55, 103, 177], [190, 154, 83]], dtype=np.float64)
    synthetic = np.empty((64, 64, 3), dtype=np.float64)
    for y in range(64):
        for x in range(64):
            base = palette[(x // 8 + (y // 8) * 3) % len(palette)]
            factor = 0.45 + 0.55 * (x % 8) / 7
            # Match Math.round for these nonnegative byte values, not bankers' rounding.
            encoded = np.floor(base * factor + 0.5) / 255
            synthetic[y, x] = decode_srgb(encoded) @ srgb_to_prophoto.T
    return {"gray_ramp_16": gray, "green_patch_8": green, "synthetic_srgb64": synthetic}


def interpolate_curves(log_values: np.ndarray, axis: np.ndarray, curves: np.ndarray) -> np.ndarray:
    return np.stack([np.interp(log_values[..., channel], axis, curves[:, channel])
                     for channel in range(3)], axis=-1)


def sample_tc(tc_lut: np.ndarray, coordinates: np.ndarray) -> np.ndarray:
    from spektrafilm.utils.fast_interp_lut import apply_lut_cubic_2d
    return apply_lut_cubic_2d(tc_lut, coordinates)


def spectral_integral(cmy: np.ndarray, channel_density: np.ndarray, base_density: np.ndarray,
                      receiver: np.ndarray, valid: np.ndarray) -> np.ndarray:
    density = cmy @ channel_density.T + base_density
    transmission = np.where(valid, 10 ** -density, 0.0)
    return transmission @ receiver


def reconstruct_from_arrays(arrays: dict[str, np.ndarray], image: np.ndarray,
                            midgray: float, output_spec: object) -> dict[str, np.ndarray]:
    from spektrafilm.utils.gamut_compression import compress_rgb
    xyz = image @ arrays["proPhotoToXyzReferenceCat16"].T
    brightness = np.sum(xyz, axis=-1)
    denominator = np.maximum(brightness, 1e-10)
    x = xyz[..., 0] / denominator
    y = xyz[..., 1] / denominator
    coordinates = np.stack((np.clip((1 - x) ** 2, 0, 1), np.clip(y / np.maximum(1 - x, 1e-10), 0, 1)), axis=-1)
    raw = sample_tc(arrays["filmTcLut"], coordinates) * brightness[..., None]
    film_raw = np.log10(np.maximum(raw, 0.0) + 1e-10)
    normalized = interpolate_curves(film_raw, arrays["filmLogExposure"], arrays["filmNormalizedCurves"])
    correction = normalized @ arrays["filmDirMatrix"]
    negative = interpolate_curves(film_raw - correction, arrays["filmLogExposure"], arrays["filmDirCurves"])
    enlarger_receiver = arrays["filteredEnlarger"][:, None] * 10 ** arrays["paperLogSensitivity"]
    paper_raw = spectral_integral(negative, arrays["filmChannelDensity"], arrays["filmBaseDensity"],
                                  enlarger_receiver, arrays["filmSpectralValidMask"]) * midgray
    paper_log = np.log10(np.maximum(paper_raw, 0.0) + 1e-10)
    paper_density = interpolate_curves(paper_log, arrays["paperLogExposure"], arrays["paperFittedCurves"])
    viewing = arrays["viewingIlluminant"]
    receiver = viewing[:, None] * arrays["cmfs"] / np.sum(viewing * arrays["cmfs"][:, 1])
    xyz_print = spectral_integral(paper_density, arrays["paperChannelDensity"], arrays["paperBaseDensity"],
                                  receiver, arrays["paperSpectralValidMask"])
    linear_rgb = xyz_print @ arrays["xyzViewingToSrgbCat02"].T
    compressed = compress_rgb(linear_rgb, output_spec, output_color_space="sRGB")
    print_rgb = colour.RGB_to_RGB(compressed, "sRGB", "sRGB", apply_cctf_decoding=False, apply_cctf_encoding=True)
    return {"filmRaw": film_raw, "negativeDensity": negative, "paperLogExposure": paper_log,
            "paperDensity": paper_density, "printRgb": print_rgb}


def compatibility_report(upstream: Path, fixtures: dict[str, dict[str, np.ndarray]],
                         setup: dict[str, object], compatibility_setup: Path) -> dict[str, object]:
    old = json.loads(compatibility_setup.read_text())
    if old.get("source", {}).get("revision") != EXPECTED_REVISION:
        raise ValueError("Compatibility resource has the wrong source revision")
    comparisons = {}
    for name in LEGACY_ARRAYS:
        old_array = old["arrays"][name]
        new_array = setup["arrays"][name]
        if old_array["shape"] != new_array["shape"]:
            raise RuntimeError(f"Portra 400 compatibility array shape changed: {name}")
        comparison = difference(np.asarray(new_array["values"]), np.asarray(old_array["values"]), {"atol": 1e-12, "rtol": 1e-12})
        if not comparison["passes"]:
            raise RuntimeError(f"Portra 400 compatibility array changed: {name}: {comparison}")
        comparisons[name] = {"oldPayloadSha256": old_array["payloadSha256"], "newPayloadSha256": new_array["payloadSha256"], **comparison}
    baseline_results = {}
    stage_cases = {
        "film_raw_portra_endura_gray_ramp16": ("gray_ramp_16", "filmRaw"),
        "negative_density_portra_endura_gray_ramp16": ("gray_ramp_16", "negativeDensity"),
        "print_rgb_portra_endura_gray_ramp16": ("gray_ramp_16", "printRgb"),
        "print_rgb_portra_endura_green_patch8": ("green_patch_8", "printRgb"),
    }
    for case_id, (recipe, stage) in stage_cases.items():
        source_path = upstream / "tests/baselines" / f"{case_id}.npz"
        npz_digest, output_digest, expected_pass, expected_violations = EXPECTED_COMPATIBILITY_BASELINES[case_id]
        if sha256(source_path) != npz_digest:
            raise RuntimeError(f"Compatibility baseline digest changed: {case_id}")
        with np.load(source_path, allow_pickle=False) as archive:
            expected = np.asarray(archive["output"], dtype=np.float64)
        if payload_digest(expected) != output_digest:
            raise RuntimeError(f"Compatibility baseline payload changed: {case_id}")
        result = difference(fixtures[recipe][stage], expected, {"atol": 1e-6, "rtol": 1.5e-3})
        if result["passes"] != expected_pass or result["violations"] != expected_violations:
            raise RuntimeError(f"Unexpected Portra 400 compatibility result: {case_id}: {result}")
        baseline_results[case_id] = {**result, "npzSha256": npz_digest, "outputPayloadSha256": output_digest,
                                     "historicalExpectedPass": expected_pass}
    return {
        "resourceSha256": sha256(compatibility_setup), "identicalLegacyArrayPayloads": comparisons,
        "baselines": baseline_results,
        "historicalLimitation": "The committed gray print-RGB baseline retains 48 darkest-column violations under current upstream OkLch; no baseline was regenerated or hidden.",
    }


def export_pair(upstream: Path, film_id: str, paper_id: str, migration: str,
                source_files: dict[str, str], common: dict[str, object]) -> dict[str, object]:
    from spektrafilm.config import STANDARD_OBSERVER_CMFS
    from spektrafilm.model.couplers import compute_density_curves_before_dir_couplers, compute_dir_couplers_matrix
    from spektrafilm.model.illuminants import standard_illuminant
    from spektrafilm.runtime.pipeline import SimulationPipeline
    from spektrafilm.utils.gamut_compression import OutputGamutCompressSpec
    from spektrafilm.utils.morph_curves import apply_print_curves_morph
    from spektrafilm.utils.spectral_upsampling import _illuminant_to_xy, _rgb_to_tc_b
    from tests.conftest import make_fast_test_params

    film_path, film_metadata = profile_metadata(upstream, film_id, "film")
    paper_path, paper_metadata = profile_metadata(upstream, paper_id, "paper")
    film_document = json.loads(film_path.read_text())
    paper_document = json.loads(paper_path.read_text())
    if film_document["info"]["target_print"] != paper_id:
        raise ValueError(f"Explicit target-paper mismatch: {film_id} -> {paper_id}")
    if film_document["info"]["reference_illuminant"] != "D55" or paper_document["info"]["viewing_illuminant"] != "D50":
        raise ValueError("This exporter supports only the separately validated D55/D50 still-paper contract")

    filter_path = upstream / "src/spektrafilm/data/filters/neutral_print_filters.json"
    if sha256(filter_path) != EXPECTED_FILTER_SHA256:
        raise RuntimeError("Neutral-filter database digest changed")
    filter_document = json.loads(filter_path.read_text())
    try:
        exact_filter = [float(value) for value in filter_document[paper_id]["TH-KG3"][film_id]]
    except (KeyError, TypeError) as error:
        raise ValueError(f"Missing exact TH-KG3 filter for {film_id} -> {paper_id}") from error
    if len(exact_filter) != 3 or not all(math.isfinite(value) for value in exact_filter):
        raise ValueError("Invalid exact filter values")

    params = make_fast_test_params(film_profile=film_id, print_profile=paper_id)
    params.io.output_gamut_compress = OutputGamutCompressSpec(algorithm="oklch")
    if params.enlarger.illuminant != "TH-KG3" or not params.enlarger.normalize_print_exposure:
        raise ValueError("Fixed enlarger configuration changed")
    actual_filter = [params.enlarger.c_filter_neutral, params.enlarger.m_filter_neutral, params.enlarger.y_filter_neutral]
    if actual_filter != exact_filter:
        raise ValueError(f"Digested filter differs from exact pair entry: {actual_filter} != {exact_filter}")
    if not params.debug.deactivate_spatial_effects or not params.debug.deactivate_stochastic_effects:
        raise ValueError("Fixed pointwise configuration changed")
    if params.film_render.dir_couplers.diffusion_size_um != 0 or params.film_render.grain.active:
        raise ValueError("Spatial DIR or stochastic grain was not disabled")
    if params.io.input_color_space != "ProPhoto RGB" or params.io.input_cctf_decoding:
        raise ValueError("Fixed scene-linear ProPhoto input configuration changed")
    if params.io.output_color_space != "sRGB" or not params.io.output_cctf_encoding:
        raise ValueError("Fixed encoded sRGB output configuration changed")

    pipeline = SimulationPipeline(params)
    film = pipeline.film
    paper = pipeline.print
    sensitivity = np.nan_to_num(10 ** film.data.log_sensitivity)
    tc_lut = pipeline._lut_service.get_filming_tc_lut(sensitivity)
    if tc_lut.shape != (192, 192, 3):
        raise ValueError(f"Unexpected TC shape: {tc_lut.shape}")
    normalized_curves = film.data.density_curves - np.nanmin(film.data.density_curves, axis=0)
    dir_matrix = compute_dir_couplers_matrix(pipeline.film_render.dir_couplers) * pipeline.film_render.dir_couplers.amount
    dir_curves = compute_density_curves_before_dir_couplers(normalized_curves, film.data.log_exposure, dir_matrix, positive=False)
    film_valid = np.isfinite(film.data.base_density) & np.isfinite(film.data.channel_density).all(axis=1)
    paper_valid = np.isfinite(paper.data.base_density) & np.isfinite(paper.data.channel_density).all(axis=1)
    if not film_valid.any() or not paper_valid.any():
        raise ValueError("No finite spectral measurements")
    paper_curves = apply_print_curves_morph(paper.data.log_exposure, paper.data.density_curves_model,
                                             pipeline.print_render.density_curves_morph, profile_type=paper.info.type)
    filtered_enlarger = pipeline._enlarger_service.enlarger_filtered_illuminant(standard_illuminant("TH-KG3"))
    viewing = np.asarray(standard_illuminant(paper.info.viewing_illuminant), dtype=np.float64)
    cmfs = np.asarray(STANDARD_OBSERVER_CMFS[:], dtype=np.float64)
    reference_xy = _illuminant_to_xy(film.info.reference_illuminant)
    viewing_xyz = viewing @ cmfs / np.sum(viewing * cmfs[:, 1])
    viewing_xy = colour.XYZ_to_xy(viewing_xyz)
    viewing_white_xyz = colour.xy_to_XYZ(viewing_xy)
    reference_matrix = colour.adaptation.matrix_chromatic_adaptation_VonKries(
        colour.xy_to_XYZ(colour.RGB_COLOURSPACES["ProPhoto RGB"].whitepoint), colour.xy_to_XYZ(reference_xy), transform="CAT16",
    ) @ colour.RGB_COLOURSPACES["ProPhoto RGB"].matrix_RGB_to_XYZ
    calibration_reference_matrix = colour.adaptation.matrix_chromatic_adaptation_VonKries(
        colour.xy_to_XYZ(colour.RGB_COLOURSPACES["sRGB"].whitepoint), colour.xy_to_XYZ(reference_xy), transform="CAT16",
    ) @ colour.RGB_COLOURSPACES["sRGB"].matrix_RGB_to_XYZ
    viewing_matrix = colour.RGB_COLOURSPACES["sRGB"].matrix_XYZ_to_RGB @ colour.adaptation.matrix_chromatic_adaptation_VonKries(
        viewing_white_xyz, colour.xy_to_XYZ(colour.RGB_COLOURSPACES["sRGB"].whitepoint), transform="CAT02",
    )
    arrays = {
        "filmTcLut": tc_lut, "filmLogExposure": film.data.log_exposure,
        "filmNormalizedCurves": normalized_curves, "filmRawCurves": film.data.density_curves,
        "filmDirCurves": dir_curves, "filmDirMatrix": dir_matrix,
        "filmLogSensitivity": np.nan_to_num(film.data.log_sensitivity),
        "filmChannelDensity": np.nan_to_num(film.data.channel_density),
        "filmBaseDensity": np.nan_to_num(film.data.base_density),
        "filmSpectralValidMask": film_valid.astype(np.float64),
        "paperSpectralValidMask": paper_valid.astype(np.float64),
        "paperLogExposure": paper.data.log_exposure, "paperFittedCurves": paper_curves,
        "paperLogSensitivity": np.nan_to_num(paper.data.log_sensitivity),
        "paperChannelDensity": np.nan_to_num(paper.data.channel_density),
        "paperBaseDensity": np.nan_to_num(paper.data.base_density),
        "filteredEnlarger": filtered_enlarger,
        "d50": viewing, "viewingIlluminant": viewing, "cmfs": cmfs,
        "proPhotoToXyzD55Cat16": reference_matrix, "proPhotoToXyzReferenceCat16": reference_matrix,
        "midGrayToXyzReferenceCat16": calibration_reference_matrix,
        "srgbToProPhoto": colour.models.matrix_RGB_to_RGB("sRGB", "ProPhoto RGB"),
        "xyzD50ToSrgbCat02": viewing_matrix, "xyzViewingToSrgbCat02": viewing_matrix,
        "srgbToXyz": colour.RGB_COLOURSPACES["sRGB"].matrix_RGB_to_XYZ,
        "xyzToSrgb": colour.RGB_COLOURSPACES["sRGB"].matrix_XYZ_to_RGB,
        **common["arrays"],
    }
    # Use the exported raw curves and masked integral, not normalized curves or per-channel factors.
    midgray_density = pipeline._enlarger_service.density_spectral_midgray[0, 0]
    if midgray_density.shape != (81,):
        raise ValueError(f"Unexpected mid-gray spectral density shape: {midgray_density.shape}")
    # Upstream computes its calibration probe through _rgb_to_film_raw's
    # default linear-sRGB arguments, separately from the configured photo input.
    coordinates, brightness_values = _rgb_to_tc_b(
        np.array([[[0.184] * 3]]), color_space="sRGB",
        apply_cctf_decoding=False, reference_illuminant=film.info.reference_illuminant,
    )
    midgray_raw = sample_tc(arrays["filmTcLut"], coordinates)[0, 0] * brightness_values[0, 0]
    midgray_cmy = interpolate_curves(np.log10(np.maximum(midgray_raw, 0) + 1e-10),
                                     arrays["filmLogExposure"], arrays["filmRawCurves"])
    reconstructed_midgray_density = midgray_cmy @ arrays["filmChannelDensity"].T + arrays["filmBaseDensity"]
    valid_midgray = arrays["filmSpectralValidMask"] == 1
    if not np.all(np.isfinite(midgray_density[valid_midgray])) or not np.all(np.isnan(midgray_density[~valid_midgray])):
        raise ValueError("Unexpected mid-gray validity pattern")
    midgray_density_check = difference(reconstructed_midgray_density[valid_midgray], midgray_density[valid_midgray], {"atol": 1e-12, "rtol": 1e-12})
    if not midgray_density_check["passes"]:
        raise RuntimeError(f"Mid-gray spectral density reconstruction mismatch: {midgray_density_check}")
    enlarger_receiver = arrays["filteredEnlarger"][:, None] * 10 ** arrays["paperLogSensitivity"]
    raw_midgray = (np.where(arrays["filmSpectralValidMask"], 10 ** -reconstructed_midgray_density, 0.0)
                   @ enlarger_receiver)
    midgray_normalization = float(1 / np.exp(np.mean(np.log(np.maximum(raw_midgray, 1e-10)))))
    upstream_factor = pipeline._printing_stage._compute_exposure_factor_midgray(10 ** np.nan_to_num(paper.data.log_sensitivity), filtered_enlarger)
    midgray_check = difference(np.array([midgray_normalization]), np.asarray(upstream_factor).reshape(-1), {"atol": 1e-12, "rtol": 1e-12})
    if not midgray_check["passes"]:
        raise RuntimeError(f"Mid-gray raw-curve normalization mismatch: {midgray_check}")

    key = f"{film_id}__{paper_id}"
    setup = {
        "schema": 1, "resourceKind": "spectral-stock-setup", "resourceVersion": 1,
        "stock": {"key": key, "filmId": film_id, "paperId": paper_id, "migrationStatus": migration,
                  "film": film_metadata, "paper": paper_metadata},
        "source": {
            "project": "spektrafilm by Andrea Volpato", "url": "https://github.com/andreavolpato/spektrafilm",
            "revision": EXPECTED_REVISION, "codeLicense": "GPL-3.0-or-later", "profileLicense": "CC BY-SA 4.0",
            "profileLicenseUrl": f"https://github.com/andreavolpato/spektrafilm/blob/{EXPECTED_REVISION}/SPEKTRAFILM_LICENSE.txt",
            "colourScience": "0.4.6 (BSD-3-Clause)", "filmProfile": {"path": str(film_path.relative_to(upstream)), "sha256": EXPECTED_PROFILES[film_id]},
            "paperProfile": {"path": str(paper_path.relative_to(upstream)), "sha256": EXPECTED_PROFILES[paper_id]},
            "filter": {"path": str(filter_path.relative_to(upstream)), "sha256": EXPECTED_FILTER_SHA256,
                       "lookup": [paper_id, "TH-KG3", film_id]},
            "tables": {relative: {"path": relative, "sha256": digest} for relative, digest in EXPECTED_TABLES.items()},
            "codeFiles": {relative: {"path": relative, "sha256": digest} for relative, digest in source_files.items()},
            "redistribution": "BLOCKED: Hanatos irradiance and measured KG3 provenance unresolved",
        },
        "configuration": {
            "inputColorSpace": "ProPhoto RGB", "inputCctfDecoding": False,
            "outputColorSpace": "sRGB", "outputCctfEncoding": True, "wavelengthCount": 81,
            "filmId": film_id, "paperId": paper_id,
            "wavelengthStartNm": 380, "wavelengthEndNm": 780, "wavelengthStepNm": 5,
            "referenceIlluminant": film.info.reference_illuminant, "viewingIlluminant": paper.info.viewing_illuminant,
            "enlargerIlluminant": "TH-KG3", "enlargerCcmY": actual_filter, "printExposure": pipeline.enlarger.print_exposure,
            "printExposureCompensation": pipeline.enlarger.print_exposure_compensation,
            "normalizePrintExposure": pipeline.enlarger.normalize_print_exposure,
            "midGray": 0.184, "midGrayNormalization": midgray_normalization,
            "midGrayInputColorSpace": "sRGB", "midGrayInputCctfDecoding": False,
            "spatialEffects": False, "stochasticEffects": False, "dirAmount": pipeline.film_render.dir_couplers.amount,
            "dirDiffusionUm": pipeline.film_render.dir_couplers.diffusion_size_um,
            "hanatosWindow": True, "hanatosSurface": False, "hanatosWindowParameters": film.data.hanatos2025_adaptation_window_params.tolist(),
            "inputGamutCompression": {"active": True, "algorithm": "xy", "knee": [0.0, 1.0, 6.0]},
            "outputGamutAlgorithm": "oklch", "outputGamutKnee": [0.0, 1.0, 6.0], "outputLightnessKnee": [0.7, 1.0, 2.2],
            "legacyArrayNames": "D55/D50 names retained for the still-paper fixture; generic reference/viewing aliases carry identical values.",
        },
        "calibration": {
            "curveSource": "filmRawCurves (raw, unnormalized; DIR disabled)",
            "normalizationKind": "scalar reciprocal geometric mean of three mid-gray paper raw responses",
            "midGrayNormalization": midgray_normalization, "midGrayRawResponse": raw_midgray.tolist(),
            "upstreamComparison": midgray_check,
            "spectralDensityReconstruction": midgray_density_check,
        },
        "notices": {
            "profileAttribution": "spektrafilm profiles by Andrea Volpato, CC BY-SA 4.0; direct derived tables retain applicable attribution/share-alike obligations.",
            "modification": "2026-11-06 FilmFrame controlled research export: encoded selected film/paper arrays, exact-pair filters, reference/viewing transforms, scalar calibration and synthetic fixtures; no measured values retuned.",
            "limitations": "Pointwise numeric fixture only; spatial/stochastic native effects, UI integration, production rendering and full native parity are not validated or claimed.",
            "distribution": "Local controlled research only; no public redistribution approval. Hanatos/KG3 and global asset rights remain unresolved.",
        },
        "arrays": {name: packed(value) for name, value in arrays.items()},
    }
    images = fixture_images(arrays["srgbToProPhoto"])
    fixtures: dict[str, dict[str, np.ndarray]] = {}
    fixture_manifest: dict[str, object] = {"cases": {}, "tolerances": TOLERANCES}
    all_pass = True
    for recipe, image in images.items():
        upstream_stages = {
            "filmRaw": pipeline.process(image, collect="log_e_film"),
            "negativeDensity": pipeline.process(image, collect="cmy_film"),
            "paperLogExposure": pipeline.process(image, collect="log_e_print"),
            "paperDensity": pipeline.process(image, collect="cmy_print"),
            "printRgb": pipeline.process(image),
        }
        reconstructed = reconstruct_from_arrays(arrays, image, midgray_normalization, params.io.output_gamut_compress)
        case = {"input": {"shape": list(image.shape), "payloadSha256": payload_digest(image)}, "stages": {}}
        for stage in TOLERANCES:
            result = difference(reconstructed[stage], upstream_stages[stage], TOLERANCES[stage])
            result["upstreamPayloadSha256"] = payload_digest(upstream_stages[stage])
            result["reconstructedPayloadSha256"] = payload_digest(reconstructed[stage])
            case["stages"][stage] = result
            all_pass = all_pass and result["passes"]
        fixtures[recipe] = {"input": image, **upstream_stages}
        fixture_manifest["cases"][recipe] = case
    fixture_manifest["passes"] = all_pass
    fixture_manifest["scope"] = "Exported-array reconstruction compared with independently executed pinned upstream stages; not a TypeScript/GPU/native-effects comparison."
    if not all_pass:
        raise RuntimeError(f"Array-driven numerical validation failed for {key}: {json.dumps(fixture_manifest)}")
    return {"key": key, "setup": setup, "filmBytes": film_path.read_bytes(), "paperBytes": paper_path.read_bytes(),
            "fixtures": fixtures, "fixtureManifest": fixture_manifest, "filmId": film_id, "paperId": paper_id}


def export(upstream: Path, resources: Path, report_path: Path, compatibility_setup: Path) -> None:
    if not sys.flags.isolated:
        raise RuntimeError("Run this exporter with Python -I")
    upstream = upstream.resolve()
    resources = resources.resolve()
    report_path = report_path.resolve()
    compatibility_setup = compatibility_setup.resolve()
    for output in (resources, report_path):
        if output == upstream or upstream in output.parents:
            raise ValueError("Generated outputs must not be written into the downloaded checkout")
    source_files = validate_source(upstream)
    import scipy
    for module, expected in EXPECTED_ENVIRONMENT.items():
        actual = {"numpy": np.__version__, "scipy": scipy.__version__, "colour": colour.__version__}[module]
        if actual != expected:
            raise RuntimeError(f"Expected {module}=={expected}, found {actual}")

    # Upstream is imported only after pin/source checks, through explicit paths.
    sys.path.insert(0, str(upstream))
    sys.path.insert(0, str(upstream / "src"))
    from spektrafilm.config import STANDARD_OBSERVER_CMFS
    from spektrafilm.utils.gamut_compression import _get_output_c_max_table, _output_cs_whitepoint_xyz
    cmax_l, cmax_h, cmax = _get_output_c_max_table("oklch", "sRGB")
    if cmax_l.shape != (64,) or cmax_h.shape != (720,) or cmax.shape != (64, 720):
        raise ValueError("Unexpected OkLch table shapes")
    if np.asarray(STANDARD_OBSERVER_CMFS[:]).shape != (81, 3):
        raise ValueError("Unexpected observer table shape")
    common = {"arrays": {
        "xyzWhiteSrgb": _output_cs_whitepoint_xyz("sRGB"), "cam16LGrid": cmax_l, "cam16HGrid": cmax_h,
        "cam16Cmax": cmax, "oklabXyzToLms": colour.models.oklab.MATRIX_1_XYZ_TO_LMS,
        "oklabLmsToXyz": colour.models.oklab.MATRIX_1_LMS_TO_XYZ,
        "oklabLmsToLab": colour.models.oklab.MATRIX_2_LMS_TO_LAB, "oklabLabToLms": colour.models.oklab.MATRIX_2_LAB_TO_LMS,
    }}
    common_digests = {name: payload_digest(value) for name, value in common["arrays"].items()}
    artifacts = []
    for film_id, paper_id, migration in PROFILE_PAIRS:
        print(f"Generating and validating {film_id} -> {paper_id}", flush=True)
        artifact = export_pair(upstream, film_id, paper_id, migration, source_files, common)
        for name, expected in common_digests.items():
            if artifact["setup"]["arrays"][name]["payloadSha256"] != expected:
                raise RuntimeError(f"Common table changed unexpectedly for {artifact['key']}: {name}")
        if migration == "compatibility-fixture":
            artifact["compatibility"] = compatibility_report(upstream, artifact["fixtures"], artifact["setup"], compatibility_setup)
        artifacts.append(artifact)

    index = {"schema": 1, "resourceKind": "spectral-stock-generated-index", "sourceRevision": EXPECTED_REVISION,
             "scope": "Generated numerical resources only; no runtime registration, UI integration or native-effects parity claim.",
             "stocks": []}
    for artifact in artifacts:
        directory = resources / artifact["key"]
        setup_bytes = json_bytes(artifact["setup"])
        write_bytes(directory / "setup.json", setup_bytes)
        write_bytes(directory / "film.json", artifact["filmBytes"])
        write_bytes(directory / "paper.json", artifact["paperBytes"])
        fixture_files = {}
        for recipe, stages in artifact["fixtures"].items():
            for stage, values in stages.items():
                relative = f"fixtures/{recipe}.{stage}.npy"
                path = directory / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                np.save(path, np.asarray(values, dtype=np.float64), allow_pickle=False)
                fixture_files[relative] = {"sha256": sha256(path), "shape": list(values.shape), "dtype": "float64", "order": "C"}
        fixture_manifest = {**artifact["fixtureManifest"], "files": fixture_files,
                            "setupSha256": hashlib.sha256(setup_bytes).hexdigest(),
                            "sourceRevision": EXPECTED_REVISION,
                            "midGrayNormalization": artifact["setup"]["configuration"]["midGrayNormalization"]}
        if "compatibility" in artifact:
            fixture_manifest["portra400Compatibility"] = artifact["compatibility"]
        write_bytes(directory / "fixtures/manifest.json", json_bytes(fixture_manifest))
        write_bytes(directory / "NOTICE.json", json_bytes(artifact["setup"]["notices"]))
        index["stocks"].append({
            "key": artifact["key"], "filmId": artifact["filmId"], "paperId": artifact["paperId"],
            "migrationStatus": artifact["setup"]["stock"]["migrationStatus"],
            "referenceIlluminant": artifact["setup"]["configuration"]["referenceIlluminant"],
            "viewingIlluminant": artifact["setup"]["configuration"]["viewingIlluminant"],
            "enlargerCcmY": artifact["setup"]["configuration"]["enlargerCcmY"],
            "midGrayNormalization": artifact["setup"]["configuration"]["midGrayNormalization"],
            "setup": f"{artifact['key']}/setup.json", "setupSha256": hashlib.sha256(setup_bytes).hexdigest(),
            "fixtureManifest": f"{artifact['key']}/fixtures/manifest.json",
            "numericalValidationPasses": artifact["fixtureManifest"]["passes"],
        })
    write_bytes(resources / "index.json", json_bytes(index))
    report = {
        "schema": 1, "date": "2026-11-06", "passes": True,
        "scope": f"{len(artifacts)} exact color-negative/paper resource exports with source-specific exported-array numerical fixtures. No runtime/UI integration or full native effects parity.",
        "execution": {"command": [sys.executable, "-I", str(Path(__file__).resolve()), *sys.argv[1:]],
                      "isolatedPython": bool(sys.flags.isolated), "upstream": str(upstream),
                      "resources": str(resources), "compatibilitySetup": str(compatibility_setup)},
        "environment": {"python": sys.version, "platform": platform.platform(), "machine": platform.machine(),
                        "numpy": np.__version__, "scipy": scipy.__version__, "colour": colour.__version__,
                        "numba": importlib.metadata.version("numba"), "opt-einsum": importlib.metadata.version("opt-einsum")},
        "source": {"revision": EXPECTED_REVISION, "codeFiles": source_files, "profiles": EXPECTED_PROFILES,
                   "neutralPrintFiltersSha256": EXPECTED_FILTER_SHA256, "tables": EXPECTED_TABLES,
                   "exporterSha256": sha256(Path(__file__).resolve())},
        "tolerances": TOLERANCES,
        "toleranceMeaning": "abs(exported-array reconstruction - pinned upstream) <= atol + rtol * abs(pinned upstream), per element; finite values and equal shapes checked first.",
        "commonTablePayloadSha256": common_digests,
        "stocks": index["stocks"],
        "fixtureDetails": {artifact["key"]: artifact["fixtureManifest"] for artifact in artifacts},
        "compatibility": {artifact["key"]: artifact["compatibility"] for artifact in artifacts if "compatibility" in artifact},
        "limitations": [
            "Only D55-referenced still color negatives printed to D50-viewed Portra Endura or Fuji Crystal Archive Type II are covered.",
            "Grain, halation/scatter, spatial DIR diffusion, glare, lens/scanner blur and unsharp mask are disabled. Full native SpektraFilm/SpektraLab effects parity is not claimed.",
            "Fixtures compare exported-array numerical reconstruction with pinned upstream float64 stages. They do not establish TypeScript, WebGL, FilmFrame UI, template, browser or export parity.",
            "Portra 400's historical darkest-column gray print-RGB discrepancy remains explicitly recorded; current controlled upstream fixtures are distinct from that historical baseline.",
            "Hanatos irradiance and measured KG3 redistribution remain unresolved. Profile/table attribution does not grant public distribution clearance; the global manifest was not modified.",
            "X-Tra 400 is a distinct stock, not a Superia 400 substitute. Missing exact stocks, B&W, slide films and exact CineStill halation remain outside this rollout.",
        ],
        "licensing": {
            "code": "Derived numeric exporter: GPL-3.0-or-later; spektrafilm by Andrea Volpato.",
            "profilesAndDerivatives": "CC BY-SA 4.0, Andrea Volpato; source, license URL and modification notices retained.",
            "colourScience": "colour-science 0.4.6, BSD-3-Clause.",
            "distribution": "BLOCKED pending Hanatos/KG3 provenance and the separate global FilmFrame asset/license review.",
        },
        "nextSteps": {
            "runtime": "A separately owned typed registry/resource decoder must validate these generated shapes/digests before use; runtime registration and browser checks are not performed here.",
            "vision3": "Deferred. Generalize K75P viewing and D55/T reference transforms, exact Kodak 2383 paper arrays/filter pairs, then independently export and validate each Vision3 pair before any registration.",
        },
    }
    write_bytes(report_path, json_bytes(report))
    print(f"Exported {len(artifacts)} validated stock pairs to {resources}", flush=True)
    print(f"Wrote numerical/provenance report to {report_path}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", required=True, type=Path)
    parser.add_argument("--resources", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--compatibility-setup", required=True, type=Path)
    args = parser.parse_args()
    export(args.upstream, args.resources, args.report, args.compatibility_setup)


if __name__ == "__main__":
    main()
