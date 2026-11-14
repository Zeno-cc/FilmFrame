export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const COMMON = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
vec3 multiply3(mat3 matrix, vec3 vector) {
  return vec3(
    matrix[0][0] * vector.x + matrix[1][0] * vector.y + matrix[2][0] * vector.z,
    matrix[0][1] * vector.x + matrix[1][1] * vector.y + matrix[2][1] * vector.z,
    matrix[0][2] * vector.x + matrix[1][2] * vector.y + matrix[2][2] * vector.z
  );
}
float signedPower(float value, float exponent) { return sign(value) * pow(abs(value), exponent); }
float interpolateCurve(sampler2D axis, sampler2D curves, float value, int channel) {
  float first = texelFetch(axis, ivec2(0, 0), 0).r;
  float last = texelFetch(axis, ivec2(255, 0), 0).r;
  if (value <= first) return texelFetch(curves, ivec2(0, channel), 0).r;
  if (value >= last) return texelFetch(curves, ivec2(255, channel), 0).r;
  float coordinate = clamp((value - first) / (last - first) * 255.0, 0.0, 255.0);
  int low = int(min(floor(coordinate), 254.0));
  float fraction = coordinate - float(low);
  float a = texelFetch(curves, ivec2(low, channel), 0).r;
  float b = texelFetch(curves, ivec2(low + 1, channel), 0).r;
  return mix(a, b, fraction);
}
vec3 spectralIntegral(vec3 density, sampler2D channelDensity, sampler2D baseDensity, sampler2D receiver, sampler2D validMask) {
  vec3 integrated = vec3(0.0);
  for (int wavelength = 0; wavelength < 81; ++wavelength) {
    vec3 channel = texelFetch(channelDensity, ivec2(wavelength, 0), 0).rgb;
    float base = texelFetch(baseDensity, ivec2(wavelength, 0), 0).r;
    float valid = texelFetch(validMask, ivec2(wavelength, 0), 0).r;
    vec3 transmission = vec3(valid == 0.0 ? 0.0 : exp2(-(base + dot(density, channel)) * 3.32192809488736234787));
    integrated += transmission * texelFetch(receiver, ivec2(wavelength, 0), 0).rgb;
  }
  return integrated;
}
`;

export const CINESTILL_MAX_SHADER = `${COMMON}
uniform sampler2D uSource;
uniform ivec2 uSourceSize;
void main() {
  ivec2 base = ivec2(gl_FragCoord.xy) * 2;
  vec3 maximum = vec3(0.0);
  for (int y = 0; y < 2; ++y) for (int x = 0; x < 2; ++x) {
    ivec2 point = base + ivec2(x, y);
    if (point.x < uSourceSize.x && point.y < uSourceSize.y) maximum = max(maximum, texelFetch(uSource, point, 0).rgb);
  }
  fragColor = vec4(maximum, 1.0);
}`;

export const CINESTILL_HEADROOM_SHADER = `${COMMON}
uniform sampler2D uSource;
uniform float uClip;
uniform float uHeadroomEv;
float gate(float value) {
  float t = clamp(value, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
void main() {
  vec3 source = texelFetch(uSource, ivec2(gl_FragCoord.xy), 0).rgb;
  float maximum = max(source.r, max(source.g, source.b));
  float gain = 1.0;
  if (maximum > 0.0 && uClip > 0.0) {
    float nearClip = gate((log2(maximum / uClip) + 1.0) / 0.75);
    float overFloor = gate((log2(maximum / 0.184) - 1.5));
    gain = exp2(uHeadroomEv * nearClip * overFloor);
  }
  fragColor = vec4(source * gain, 1.0);
}`;

export const CINESTILL_BLUR_SHADER = `${COMMON}
uniform sampler2D uSource;
uniform ivec2 uSourceSize;
uniform ivec2 uAxis;
uniform vec3 uSigma;
uniform vec3 uWeight;
int reflectedIndex(int index, int size) {
  if (size <= 1) return 0;
  int period = 2 * size - 2;
  int wrapped = ((index % period) + period) % period;
  return wrapped < size ? wrapped : period - wrapped;
}
void main() {
  ivec2 point = ivec2(gl_FragCoord.xy);
  vec3 sum = vec3(0.0);
  for (int channel = 0; channel < 3; ++channel) {
    float sigma = uSigma[channel];
    int radius = int(3.0 * sigma + 0.5);
    float normalization = 0.0;
    for (int tap = -radius; tap <= radius; ++tap) normalization += exp(-0.5 * pow(float(tap) / sigma, 2.0));
    for (int tap = -radius; tap <= radius; ++tap) {
      ivec2 samplePoint = point + uAxis * tap;
      samplePoint.x = reflectedIndex(samplePoint.x, uSourceSize.x);
      samplePoint.y = reflectedIndex(samplePoint.y, uSourceSize.y);
      vec3 source = texelFetch(uSource, samplePoint, 0).rgb;
      sum[channel] += source[channel] * exp(-0.5 * pow(float(tap) / sigma, 2.0)) / normalization;
    }
  }
  fragColor = vec4(sum * uWeight, 1.0);
}`;

export const CINESTILL_ACCUMULATE_SHADER = `${COMMON}
uniform sampler2D uAccumulator;
uniform sampler2D uSource;
uniform vec3 uWeight;
uniform bool uInitialize;
void main() {
  ivec2 point = ivec2(gl_FragCoord.xy);
  vec3 accumulated = uInitialize ? vec3(0.0) : texelFetch(uAccumulator, point, 0).rgb;
  fragColor = vec4(accumulated + uWeight * texelFetch(uSource, point, 0).rgb, 1.0);
}`;

export const CINESTILL_MIX_SHADER = `${COMMON}
uniform sampler2D uSource;
uniform sampler2D uHalo;
uniform vec3 uStrength;
void main() {
  ivec2 point = ivec2(gl_FragCoord.xy);
  vec3 source = texelFetch(uSource, point, 0).rgb;
  vec3 halo = texelFetch(uHalo, point, 0).rgb;
  fragColor = vec4((source + uStrength * halo) / (vec3(1.0) + uStrength), 1.0);
}`;

export const FILM_EXPOSURE_SHADER = `${COMMON}
uniform sampler2D uSource;
uniform sampler2D uFilmTcLut;
uniform mat3 uProPhotoToXyz;
float mitchellWeight(float value) {
  float x = abs(value);
  const float b = 1.0 / 3.0;
  const float c = 1.0 / 3.0;
  if (x < 1.0) return ((12.0 - 9.0 * b - 6.0 * c) * pow(x, 3.0) + (-18.0 + 12.0 * b + 6.0 * c) * x * x + 6.0 - 2.0 * b) / 6.0;
  if (x < 2.0) return ((-b - 6.0 * c) * pow(x, 3.0) + (6.0 * b + 30.0 * c) * x * x + (-12.0 * b - 48.0 * c) * x + 8.0 * b + 24.0 * c) / 6.0;
  return 0.0;
}
int reflectedIndex(int index, int side) {
  if (index < 0) return -index;
  if (index >= side) return 2 * (side - 1) - index;
  return index;
}
vec2 cubicCell(float coordinate) {
  float clamped = clamp(coordinate, 0.0, 191.0);
  if (clamped >= 191.0) return vec2(190.0, 1.0);
  float base = floor(clamped);
  return vec2(base, clamped - base);
}
vec3 sampleFilmTcLut(float tx, float ty) {
  vec2 xCell = cubicCell(tx * 191.0);
  vec2 yCell = cubicCell(ty * 191.0);
  float wx[4];
  float wy[4];
  for (int i = 0; i < 4; ++i) {
    wx[i] = mitchellWeight(xCell.y + 1.0 - float(i));
    wy[i] = mitchellWeight(yCell.y + 1.0 - float(i));
  }
  vec3 sampled = vec3(0.0);
  float weightSum = 0.0;
  for (int xi = 0; xi < 4; ++xi) {
    int x = reflectedIndex(int(xCell.x) - 1 + xi, 192);
    for (int yi = 0; yi < 4; ++yi) {
      int y = reflectedIndex(int(yCell.x) - 1 + yi, 192);
      float weight = wx[xi] * wy[yi];
      sampled += weight * texelFetch(uFilmTcLut, ivec2(y, x), 0).rgb;
      weightSum += weight;
    }
  }
  return weightSum == 0.0 ? vec3(0.0) : sampled / weightSum;
}
void main() {
  vec3 xyz = multiply3(uProPhotoToXyz, texture(uSource, vUv).rgb);
  float brightness = xyz.x + xyz.y + xyz.z;
  float denominator = max(brightness, 1e-10);
  float x = xyz.x / denominator;
  float y = xyz.y / denominator;
  float tx = clamp(pow(1.0 - x, 2.0), 0.0, 1.0);
  float ty = clamp(y / max(1.0 - x, 1e-10), 0.0, 1.0);
  vec3 sampled = sampleFilmTcLut(tx, ty) * brightness;
  fragColor = vec4(log(max(sampled, vec3(0.0)) + vec3(1e-10)) * 0.43429448190325182765, 1.0);
}`;

export const FILM_DEVELOPMENT_SHADER = `${COMMON}
uniform sampler2D uFilmRaw;
uniform sampler2D uFilmLogExposure;
uniform sampler2D uFilmNormalizedCurves;
uniform sampler2D uFilmDirCurves;
uniform vec3 uDirDonor0;
uniform vec3 uDirDonor1;
uniform vec3 uDirDonor2;
void main() {
  vec3 filmRaw = texture(uFilmRaw, vUv).rgb;
  vec3 normalized = vec3(
    interpolateCurve(uFilmLogExposure, uFilmNormalizedCurves, filmRaw.r, 0),
    interpolateCurve(uFilmLogExposure, uFilmNormalizedCurves, filmRaw.g, 1),
    interpolateCurve(uFilmLogExposure, uFilmNormalizedCurves, filmRaw.b, 2)
  );
  // CPU donor-row/receiver-column order, supplied as three explicit row uniforms.
  vec3 correction = normalized.r * uDirDonor0 + normalized.g * uDirDonor1 + normalized.b * uDirDonor2;
  fragColor = vec4(
    interpolateCurve(uFilmLogExposure, uFilmDirCurves, filmRaw.r - correction.r, 0),
    interpolateCurve(uFilmLogExposure, uFilmDirCurves, filmRaw.g - correction.g, 1),
    interpolateCurve(uFilmLogExposure, uFilmDirCurves, filmRaw.b - correction.b, 2), 1.0
  );
}`;

export const POSITIVE_DEVELOPMENT_SHADER = `${COMMON}
uniform sampler2D uFilmRaw;
uniform sampler2D uFilmLogExposure;
uniform sampler2D uFilmNormalizedCurves;
uniform sampler2D uFilmDirCurves;
uniform vec3 uDirDonor0;
uniform vec3 uDirDonor1;
uniform vec3 uDirDonor2;
uniform vec3 uFilmDensityMax;
void main() {
  vec3 filmRaw = texture(uFilmRaw, vUv).rgb;
  vec3 silver = uFilmDensityMax - vec3(
    interpolateCurve(uFilmLogExposure, uFilmNormalizedCurves, filmRaw.r, 0),
    interpolateCurve(uFilmLogExposure, uFilmNormalizedCurves, filmRaw.g, 1),
    interpolateCurve(uFilmLogExposure, uFilmNormalizedCurves, filmRaw.b, 2)
  );
  vec3 correction = silver.r * uDirDonor0 + silver.g * uDirDonor1 + silver.b * uDirDonor2;
  fragColor = vec4(
    interpolateCurve(uFilmLogExposure, uFilmDirCurves, filmRaw.r - correction.r, 0),
    interpolateCurve(uFilmLogExposure, uFilmDirCurves, filmRaw.g - correction.g, 1),
    interpolateCurve(uFilmLogExposure, uFilmDirCurves, filmRaw.b - correction.b, 2), 1.0
  );
}`;

export const MONOCHROME_DEVELOPMENT_SHADER = `${COMMON}
uniform sampler2D uFilmRaw;
uniform sampler2D uFilmLogExposure;
uniform sampler2D uFilmNormalizedCurves;
void main() {
  vec3 filmRaw = texture(uFilmRaw, vUv).rgb;
  fragColor = vec4(
    interpolateCurve(uFilmLogExposure, uFilmNormalizedCurves, filmRaw.r, 0),
    interpolateCurve(uFilmLogExposure, uFilmNormalizedCurves, filmRaw.g, 1),
    interpolateCurve(uFilmLogExposure, uFilmNormalizedCurves, filmRaw.b, 2), 1.0
  );
}`;

export const FILM_PRESENCE_SHADER = `${COMMON}
uniform sampler2D uNegativeDensity;
uniform sampler2D uFilmPresence;
uniform vec3 uHoleCmy;
void main() {
  float presence = texelFetch(uFilmPresence, ivec2(gl_FragCoord.xy), 0).r;
  vec3 negative = texelFetch(uNegativeDensity, ivec2(gl_FragCoord.xy), 0).rgb;
  fragColor = vec4(mix(uHoleCmy, negative, presence), 1.0);
}`;

export const PAPER_EXPOSURE_SHADER = `${COMMON}
uniform sampler2D uNegativeDensity;
uniform sampler2D uFilmChannelDensity;
uniform sampler2D uFilmBaseDensity;
uniform sampler2D uFilmSpectralValidMask;
uniform sampler2D uEnlargerReceiver;
uniform vec3 uNormalization;
void main() {
  vec3 negative = texture(uNegativeDensity, vUv).rgb;
  vec3 integrated = spectralIntegral(negative, uFilmChannelDensity, uFilmBaseDensity, uEnlargerReceiver, uFilmSpectralValidMask);
  fragColor = vec4(log(max(integrated * uNormalization, vec3(0.0)) + vec3(1e-10)) * 0.43429448190325182765, 1.0);
}`;

export const PAPER_DEVELOPMENT_SHADER = `${COMMON}
uniform sampler2D uPaperLogExposureInput;
uniform sampler2D uPaperLogExposure;
uniform sampler2D uPaperFittedCurves;
void main() {
  vec3 logExposure = texture(uPaperLogExposureInput, vUv).rgb;
  fragColor = vec4(
    interpolateCurve(uPaperLogExposure, uPaperFittedCurves, logExposure.r, 0),
    interpolateCurve(uPaperLogExposure, uPaperFittedCurves, logExposure.g, 1),
    interpolateCurve(uPaperLogExposure, uPaperFittedCurves, logExposure.b, 2), 1.0
  );
}`;

export const SCAN_SHADER = `${COMMON}
uniform sampler2D uScanDensity;
uniform sampler2D uScanChannelDensity;
uniform sampler2D uScanBaseDensity;
uniform sampler2D uScanSpectralValidMask;
uniform sampler2D uScanReceiver;
uniform sampler2D uCam16LGrid;
uniform sampler2D uCam16HGrid;
uniform sampler2D uCam16Cmax;
uniform mat3 uXyzD50ToSrgb;
uniform mat3 uSrgbToXyz;
uniform mat3 uOklabXyzToLms;
uniform mat3 uOklabLmsToLab;
uniform mat3 uOklabLabToLms;
uniform mat3 uOklabLmsToXyz;
uniform mat3 uXyzToSrgb;
float reinhardKnee(float value, float threshold, float limit, float powerValue) {
  if (value <= threshold) return value;
  float scale = limit - threshold;
  float normalized = (value - threshold) / scale;
  return threshold + scale * normalized / pow(1.0 + pow(normalized, powerValue), 1.0 / powerValue);
}
float sampleCmax(float lightness, float hue) {
  float lFirst = texelFetch(uCam16LGrid, ivec2(0, 0), 0).r;
  float lLast = texelFetch(uCam16LGrid, ivec2(63, 0), 0).r;
  float l = clamp(lightness, lFirst, lLast);
  float li = (l - lFirst) / (lLast - lFirst) * 63.0;
  int low = int(clamp(floor(li), 0.0, 62.0));
  float lf = li - float(low);
  float hFirst = texelFetch(uCam16HGrid, ivec2(0, 0), 0).r;
  float hStep = texelFetch(uCam16HGrid, ivec2(1, 0), 0).r - hFirst;
  float hi = (hue - hFirst) / hStep;
  int floorH = int(floor(hi));
  int h0 = ((floorH % 720) + 720) % 720;
  int h1 = (h0 + 1) % 720;
  float hf = (hue - texelFetch(uCam16HGrid, ivec2(h0, 0), 0).r) / hStep;
  float a = texelFetch(uCam16Cmax, ivec2(h0, low), 0).r;
  float b = texelFetch(uCam16Cmax, ivec2(h1, low), 0).r;
  float c = texelFetch(uCam16Cmax, ivec2(h0, low + 1), 0).r;
  float d = texelFetch(uCam16Cmax, ivec2(h1, low + 1), 0).r;
  return a * (1.0 - lf) * (1.0 - hf) + b * (1.0 - lf) * hf + c * lf * (1.0 - hf) + d * lf * hf;
}
vec3 encodeSrgb(vec3 value) {
  vec3 low = value * 12.92;
  vec3 high = vec3(1.055) * vec3(signedPower(value.r, 1.0 / 2.4), signedPower(value.g, 1.0 / 2.4), signedPower(value.b, 1.0 / 2.4)) - vec3(0.055);
  return mix(high, low, lessThanEqual(value, vec3(0.0031308)));
}
void main() {
  vec3 paper = texture(uScanDensity, vUv).rgb;
  vec3 xyz = spectralIntegral(paper, uScanChannelDensity, uScanBaseDensity, uScanReceiver, uScanSpectralValidMask);
  vec3 linear = multiply3(uXyzD50ToSrgb, xyz);
  vec3 lms = multiply3(uOklabXyzToLms, multiply3(uSrgbToXyz, linear));
  vec3 lab = multiply3(uOklabLmsToLab, vec3(signedPower(lms.r, 1.0 / 3.0), signedPower(lms.g, 1.0 / 3.0), signedPower(lms.b, 1.0 / 3.0)));
  float lightness = reinhardKnee(lab.r, 0.7, 1.0, 2.2);
  float chroma = length(lab.gb);
  float hue = atan(lab.b, lab.g);
  float maximum = max(sampleCmax(lightness, hue), 1e-9);
  float compressed = reinhardKnee(chroma / maximum, 0.0, 1.0, 6.0) * maximum;
  // Preserve the original chroma direction without a lossy GPU sin/cos round trip.
  vec3 adjustedLab = vec3(lightness, chroma > 0.0 ? lab.gb * (compressed / chroma) : vec2(0.0));
  vec3 adjustedLms = multiply3(uOklabLabToLms, adjustedLab);
  vec3 adjustedXyz = multiply3(uOklabLmsToXyz, adjustedLms * adjustedLms * adjustedLms);
  fragColor = vec4(encodeSrgb(multiply3(uXyzToSrgb, adjustedXyz)), 1.0);
}`;
