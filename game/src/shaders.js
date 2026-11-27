// SPDX-License-Identifier: MIT
// Custom GLSL ES 3.00 shaders in true linear HDR space: Rayleigh/Mie sky, sunlit clouds, Fresnel ocean, PCF PBR world.

const COMMON_GLSL = `
vec3 toLinear(vec3 c) {
  return pow(max(c, vec3(0.0)), vec3(2.2));
}
vec3 acesTone(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSrgb(vec3 lin) {
  return pow(acesTone(lin), vec3(1.0 / 2.2));
}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm4(vec2 p) {
  float s = 0.0;
  float a = 0.52;
  mat2 m = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = m * p * 2.04 + vec2(17.1, 31.7);
    a *= 0.5;
  }
  return s;
}
`;

export const SKY_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 pos = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.9999, 1.0);
}`;

export const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform vec3 uCamFwd;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec2 uFovScale;
uniform vec2 uCenterOffset;
uniform vec3 uSunDir;
uniform vec3 uSkyTop;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uStorm;
uniform float uLightning;
uniform float uLightningX;
${COMMON_GLSL}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0 - uCenterOffset;
  vec3 dir = normalize(uCamFwd + uCamRight * (ndc.x * uFovScale.x) + uCamUp * (ndc.y * uFovScale.y));

  vec3 sTop = toLinear(uSkyTop);
  vec3 sMid = toLinear(uSkyMid);
  vec3 sHor = toLinear(uSkyHorizon);
  vec3 sunC = toLinear(uSunColor);

  float h = clamp(dir.y, 0.0, 1.0);
  // Rich dusk sky gradient (warm burnt-amber horizon -> rose/indigo -> deep cobalt zenith)
  // In Monsoon Squall: moody dark slate ceiling overhead fading cleanly into misty storm horizon!
  vec3 sky = mix(sHor, sMid, pow(h, mix(0.45, 0.35, uStorm)));
  sky = mix(sky, sTop, pow(h, mix(1.05, 0.85, uStorm)));

  if (dir.y < 0.0) {
    sky = mix(sHor, sTop * 0.45, clamp(-dir.y * 4.0, 0.0, 1.0));
  }

  // Sun corona & crisp glowing disc (fully suppressed in storm)
  float sunCos = max(dot(dir, normalize(uSunDir)), 0.0);
  float aboveHor = smoothstep(-0.04, 0.09, dir.y);
  float clearMask = 1.0 - uStorm;
  vec3 mie = sunC * (pow(sunCos, 8.0) * 0.36 + pow(sunCos, 42.0) * 0.95 + pow(sunCos, 360.0) * 3.8) * clearMask;
  float sunDisc = smoothstep(0.9990, 0.9995, sunCos) * clearMask * aboveHor;
  sky += mie * aboveHor + sunC * sunDisc * 6.0;

  // Dramatic multi-layer backlit volumetric cumulus cloud deck!
  if (dir.y > 0.012) {
    float domeDist = 1.0 / (dir.y + 0.16);
    vec2 uv1 = dir.xz * domeDist * 1.42 + vec2(uTime * 0.012, -uTime * 0.006);
    vec2 uv2 = dir.xz * domeDist * 3.05 + vec2(-uTime * 0.018, uTime * 0.010);
    float f1 = fbm4(uv1);
    float f2 = fbm4(uv2);
    float density = f1 * 0.72 + f2 * 0.28;
    float thresh = mix(0.47, 0.31, uStorm);
    float cloud = smoothstep(thresh, thresh + 0.16, density);
    float horFade = smoothstep(0.012, 0.12, dir.y) * (1.0 - smoothstep(0.72, 0.99, dir.y) * 0.25);
    cloud *= horFade;

    vec2 sunStep = normalize(uSunDir.xz + vec2(0.0001)) * 0.16;
    float lit = clamp((f1 - fbm4(uv1 + sunStep)) * 4.5 + 0.45, 0.0, 1.0);
    float rim = pow(sunCos, 4.0) * clearMask;

    // Rich twilight violet-indigo cloud bellies vs blazing sunlit amber-gold cloud tops!
    vec3 cShadow = mix(vec3(0.045, 0.042, 0.11), vec3(0.012, 0.024, 0.04), uStorm);
    vec3 cSunlit = mix(vec3(1.55, 0.64, 0.22), vec3(0.08, 0.13, 0.18), uStorm);
    vec3 cloudCol = mix(cShadow, cSunlit, lit) + sunC * rim * (1.25 - cloud * 0.4) * 0.95;

    if (uStorm > 0.3 && uLightning > 0.02) {
      float dxBolt = abs(vUv.x - uLightningX);
      cloudCol += vec3(0.38, 0.64, 1.0) * exp(-dxBolt * 4.5) * uLightning * 1.6;
    }
    sky = mix(sky, cloudCol, cloud * mix(0.92, 0.96, uStorm));
  }

  // Multi-branch jagged lightning bolt in Monsoon Squall
  if (uStorm > 0.45 && uLightning > 0.12 && vUv.y > 0.34) {
    float t = clamp((vUv.y - 0.36) / 0.64, 0.0, 1.0);
    float zig = (vnoise(vec2(t * 16.0, 3.7)) - 0.5) * 0.068 + (vnoise(vec2(t * 42.0, 9.2)) - 0.5) * 0.022;
    float boltDist = abs(vUv.x - (uLightningX + zig));
    float core = exp(-boltDist * 420.0) * uLightning * 5.2;
    float halo = exp(-boltDist * 28.0) * uLightning * 0.65;
    float branchT = clamp((vUv.y - 0.52) / 0.36, 0.0, 1.0);
    float fork1 = (vUv.y > 0.50 && vUv.y < 0.88) ? exp(-abs(vUv.x - (uLightningX + zig + (1.0 - branchT) * 0.055)) * 450.0) * uLightning * 2.4 : 0.0;
    float branch2T = clamp((vUv.y - 0.62) / 0.28, 0.0, 1.0);
    float fork2 = (vUv.y > 0.60 && vUv.y < 0.86) ? exp(-abs(vUv.x - (uLightningX + zig - (1.0 - branch2T) * 0.042)) * 480.0) * uLightning * 1.8 : 0.0;
    sky += vec3(0.65, 0.88, 1.0) * (core + halo + fork1 + fork2);
  }

  outColor = vec4(toSrgb(sky), 1.0);
}`;

export const SHADOW_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main() {
  gl_Position = uLightVP * uModel * vec4(aPos, 1.0);
}`;

export const SHADOW_FS = `#version 300 es
precision highp float;
void main() {}`;

export const OCEAN_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
uniform vec3 uCamPos;
uniform mat4 uViewProj;
uniform mat4 uLightVP;
uniform float uTime;
uniform float uStorm;
out vec3 vWorldPos;
out vec4 vLightPos;

void main() {
  vec2 g = aPos.xz;
  float r = length(g);
  vec2 dir = r > 0.0001 ? g / r : vec2(0.0);
  float dist = (r * r * 5400.0 + r * 260.0);
  vec2 wp = uCamPos.xz + dir * dist;
  float waveAmp = mix(0.38, 1.35, uStorm);
  float w1 = sin(wp.x * 0.032 + uTime * 1.45) * cos(wp.y * 0.026 + uTime * 1.1);
  float w2 = sin((wp.x * 0.065 - wp.y * 0.052) + uTime * 2.2) * 0.42;
  float y = (w1 + w2) * waveAmp * (1.0 - smoothstep(420.0, 1800.0, dist));
  vWorldPos = vec3(wp.x, y, wp.y);
  vLightPos = uLightVP * vec4(vWorldPos, 1.0);
  gl_Position = uViewProj * vec4(vWorldPos, 1.0);
}`;

export const OCEAN_FS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec4 vLightPos;
out vec4 outColor;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uOceanDeep;
uniform vec3 uOceanShallow;
uniform vec3 uFogColor;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyTop;
uniform float uFogDensity;
uniform float uTime;
uniform float uStorm;
uniform float uLightning;
uniform vec4 uIslands[16];
uniform int uIslandCount;
uniform sampler2D uShadowMap;
${COMMON_GLSL}

float sampleShadowSmooth(vec4 lp) {
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  // Smooth border fade so shadow-box edge NEVER creates a diagonal line on water!
  float edge = min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y));
  float borderFade = smoothstep(0.0, 0.08, edge);
  vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
  float s = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float d = texture(uShadowMap, p.xy + vec2(x, y) * texel).r;
      s += (p.z - 0.0022 > d) ? 0.35 : 1.0;
    }
  }
  return mix(1.0, s / 9.0, borderFade);
}

void main() {
  vec3 V = normalize(uCamPos - vWorldPos);
  float dist = length(uCamPos - vWorldPos);
  vec2 p = vWorldPos.xz;

  // Strong distance-based wave-normal attenuation kills distant horizon moire completely!
  float nearFade = 1.0 - smoothstep(140.0, 1150.0, dist);
  float midFade = 1.0 - smoothstep(260.0, 1950.0, dist);
  float wScale = mix(0.052, 0.075, uStorm);
  vec2 uvA = p * wScale + vec2(uTime * 0.36, uTime * 0.22);
  vec2 uvB = p * (wScale * 2.1) + vec2(-uTime * 0.48, uTime * 0.38);

  float h0 = fbm4(uvA) * 0.62 * midFade + vnoise(uvB) * 0.38 * nearFade;
  float hx = fbm4(uvA + vec2(0.22, 0.0)) * 0.62 * midFade + vnoise(uvB + vec2(0.38, 0.0)) * 0.38 * nearFade;
  float hz = fbm4(uvA + vec2(0.0, 0.22)) * 0.62 * midFade + vnoise(uvB + vec2(0.0, 0.38)) * 0.38 * nearFade;

  float bumpStrength = mix(1.35, 2.0, uStorm);
  vec3 N = normalize(vec3((h0 - hx) * bumpStrength, 1.0, (h0 - hz) * bumpStrength));

  // Tight shoreline-hugging turquoise reef & delicate animated coastal surf ring (NEVER floods open foreground bay!)
  float shoreProx = 0.0;
  float foamMask = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uIslandCount) break;
    vec4 isl = uIslands[i];
    float d = length(p - isl.xy) - isl.z * 0.80;
    float s = exp(-abs(d) / 85.0) * smoothstep(-60.0, 20.0, d);
    shoreProx = max(shoreProx, s);
    float surfWave = sin(d * 0.28 - uTime * 2.6 + h0 * 5.0);
    float surfBand = exp(-abs(d - 14.0) / 16.0);
    float surf = surfBand * smoothstep(0.32, 0.88, surfWave * 0.5 + 0.5);
    float edgeLine = exp(-abs(d) / 7.5);
    foamMask = max(foamMask, max(surf * 0.65, edgeLine * 0.88));
  }

  vec3 deepLin = toLinear(uOceanDeep);
  vec3 shallowLin = toLinear(uOceanShallow);
  vec3 skyHorLin = toLinear(uSkyHorizon);
  vec3 skyTopLin = toLinear(uSkyTop);
  vec3 sunLin = toLinear(uSunColor);
  vec3 fogLin = toLinear(uFogColor);

  vec3 waterBody = mix(deepLin, shallowLin, clamp(shoreProx * 0.78, 0.0, 0.85));
  vec3 R = reflect(-V, N);
  vec3 skyRefl = mix(skyHorLin * 0.55, skyTopLin * 0.95, pow(clamp(R.y, 0.0, 1.0), 0.50));
  // Coherent golden-dusk water reflection: deep navy body + warm horizon glint, ZERO milky white washout!
  float fresnel = 0.03 + 0.52 * pow(1.0 - max(dot(N, V), 0.0), 4.8);

  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0);
  // Crisp broken golden-amber wave-crest sparkles (high exponent = tight glittering highlights, never chalky slab!)
  float specTight = pow(ndh, mix(420.0, 110.0, uStorm)) * mix(4.8, 0.35, uStorm) * (0.2 + 0.8 * midFade);
  float specBroad = pow(ndh, 52.0) * mix(0.22, 0.05, uStorm);
  // Gentle shadow softening on water so distant mountain shadows never slice a razor-sharp diagonal seam!
  float shadow = mix(0.68, 1.0, sampleShadowSmooth(vLightPos));

  vec3 col = mix(waterBody * (0.50 + 0.50 * max(dot(N, L), 0.0) * shadow), skyRefl, fresnel);
  col += sunLin * (specTight + specBroad) * shadow;

  // Storm whitecaps + coastal surf foam
  float whitecap = smoothstep(0.68, 0.88, h0 / max(0.01, midFade + 0.001)) * uStorm * 0.36 * nearFade;
  float totalFoam = clamp(foamMask + whitecap, 0.0, 1.0);
  vec3 foamCol = mix(vec3(0.92, 0.84, 0.72), vec3(0.45, 0.54, 0.60), uStorm) * (0.55 + 0.45 * shadow);
  col = mix(col, foamCol, totalFoam * 0.74);

  // Subtle blue-white lightning reflection on stormy swells
  col += vec3(0.22, 0.38, 0.55) * uLightning * (0.12 + fresnel * 0.45) * uStorm;

  float fogAmt = 1.0 - exp(-pow(dist * uFogDensity, 1.32));
  float sunFog = pow(max(dot(-V, L), 0.0), 5.0) * (1.0 - uStorm * 0.85);
  vec3 fogTarget = fogLin + sunLin * sunFog * 0.35;
  col = mix(col, fogTarget, clamp(fogAmt, 0.0, 0.96));

  outColor = vec4(toSrgb(col), 1.0);
}`;

export const WORLD_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
layout(location = 3) in vec4 aMat;

uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat3 uNormalMat;
uniform mat4 uLightVP;

out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vColor;
out vec4 vMat;
out vec4 vLightPos;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(uNormalMat * aNormal);
  vColor = aColor;
  vMat = aMat;
  vLightPos = uLightVP * wp;
  gl_Position = uViewProj * wp;
}`;

export const WORLD_FS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vColor;
in vec4 vMat;
in vec4 vLightPos;
out vec4 outColor;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uStorm;
uniform float uLightning;
uniform float uDisableFog;
uniform sampler2D uShadowMap;
${COMMON_GLSL}

float sampleShadow(vec4 lp, float ndl) {
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float edge = min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y));
  float borderFade = smoothstep(0.0, 0.06, edge);
  float bias = max(0.0014 * (1.0 - ndl), 0.0006);
  vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
  float s = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float d = texture(uShadowMap, p.xy + vec2(x, y) * texel).r;
      s += (p.z - bias > d) ? 0.22 : 1.0;
    }
  }
  return mix(1.0, s / 9.0, borderFade);
}

void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 H = normalize(L + V);

  float rough = clamp(vMat.x, 0.08, 1.0);
  float metal = clamp(vMat.y, 0.0, 1.0);
  float emissive = vMat.z;
  float kind = vMat.w;

  // Convert sRGB vertex color to TRUE LINEAR SPACE before PBR lighting!
  vec3 albedo = toLinear(vColor);
  vec3 sunLin = toLinear(uSunColor);
  vec3 skyTopLin = toLinear(uSkyTop);
  vec3 skyHorLin = toLinear(uSkyHorizon);
  vec3 fogLin = toLinear(uFogColor);

  if (kind > 0.5 && kind < 1.5) {
    // Vivid Studio-Ghibli coastal multi-biome shader: cool basalt cliffs, lush deep emerald pines, warm ivory-gold beach & surf collar!
    float f1 = fbm4(vWorldPos.xz * 0.022);
    float f2 = vnoise(vWorldPos.xz * 0.13 + vec2(vWorldPos.y * 0.10));
    float steep = 1.0 - smoothstep(0.68, 0.92, N.y);
    float strata = sin(vWorldPos.y * 0.30 + f1 * 4.5) * 0.16;

    vec3 rockCool = toLinear(vec3(0.22, 0.27, 0.34)) * (0.82 + f2 * 0.34 + strata);
    vec3 rockCrag = toLinear(vec3(0.38, 0.32, 0.31)) * (0.85 + f1 * 0.28);
    vec3 cliffCol = mix(rockCrag, rockCool, smoothstep(0.28, 0.80, steep + (vWorldPos.y / 190.0) * 0.5));

    vec3 meadow = toLinear(vec3(0.11, 0.39, 0.21)) * (0.76 + f1 * 0.42 + f2 * 0.16);
    vec3 sandWet = toLinear(vec3(0.72, 0.58, 0.38)) * (0.90 + f2 * 0.15);
    vec3 sandDry = toLinear(vec3(0.95, 0.84, 0.58)) * (0.90 + f2 * 0.16);

    float beachMask = 1.0 - smoothstep(2.0, 12.5, vWorldPos.y);
    float wetMask = 1.0 - smoothstep(0.2, 3.6, vWorldPos.y);
    vec3 landCol = mix(meadow, cliffCol, smoothstep(0.14, 0.62, steep + smoothstep(52.0, 125.0, vWorldPos.y) * 0.65));
    landCol = mix(landCol, mix(sandDry, sandWet, wetMask), beachMask * (1.0 - steep * 0.45));

    // Crisp white shoreline surf collar hugging terrain waterline (y ~ 0..2.8m)!
    float foamNoise = vnoise(vWorldPos.xz * 0.16);
    float foamCollar = (1.0 - smoothstep(-0.3, 2.6 + foamNoise * 1.6, vWorldPos.y)) * smoothstep(-2.4, -0.1, vWorldPos.y);
    vec3 foamLin = mix(vec3(0.96, 0.92, 0.84), vec3(0.58, 0.68, 0.74), uStorm);
    albedo = mix(landCol, foamLin, clamp(foamCollar * 0.88, 0.0, 0.90));
  } else if (kind > 1.5 && kind < 2.5) {
    float grain = vnoise(vWorldPos.xz * 0.85) * 0.16 - 0.08;
    albedo *= (1.0 + grain);
  }

  float ndl = max(dot(N, L), 0.0);
  float shadow = (uDisableFog > 0.5 && kind > 4.5) ? 1.0 : sampleShadow(vLightPos, ndl);

  // Rich cool-vs-warm hemisphere bounce (deep cool teal-indigo shadows vs golden sunset sun!)
  float hemi = N.y * 0.5 + 0.5;
  vec3 ambGround = mix(vec3(0.05, 0.10, 0.16), vec3(0.025, 0.045, 0.07), uStorm);
  vec3 ambSky = mix(skyHorLin * 0.45 + skyTopLin * 0.55, skyHorLin * 0.35 + skyTopLin * 0.65, uStorm);
  vec3 ambient = mix(ambGround, ambSky, hemi) * mix(0.56, 0.48, uStorm);

  float shininess = mix(128.0, 10.0, rough);
  float spec = pow(max(dot(N, H), 0.0), shininess) * mix(0.95, 0.05, rough);
  vec3 specTint = mix(sunLin, albedo * sunLin * 1.6, metal);

  // Golden sunset Fresnel rim light on sculpted aircraft & cliff silhouettes
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);
  float sunBack = clamp(dot(-V, L) * 0.5 + 0.58, 0.0, 1.0);
  vec3 rim = sunLin * fresnel * sunBack * mix(0.18, 0.85, step(2.5, kind)) * (1.0 - uStorm * 0.7);

  if (kind > 3.5 && kind < 4.5) {
    vec3 R = reflect(-V, N);
    vec3 envRefl = mix(skyHorLin, skyTopLin, clamp(R.y, 0.0, 1.0));
    albedo = mix(albedo, envRefl, 0.45 + fresnel * 0.45);
    spec *= 2.4;
  }

  // Balanced warm golden-hour sunlight (no heavy sepia washout — preserves crisp ivory/crimson aircraft & emerald/slate/sand biomes!)
  vec3 sunScale = mix(vec3(1.24, 1.16, 1.06), vec3(0.34, 0.44, 0.54), uStorm);
  vec3 direct = (albedo * ndl * sunScale + specTint * spec) * shadow;
  vec3 lit = albedo * ambient + direct + rim;

  // Dynamic storm lightning rim flash illuminating right cockpit pillar, cliffs & nacelles!
  if (uStorm > 0.3 && uLightning > 0.02) {
    float flashN = max(dot(N, normalize(vec3(0.55, 0.7, 0.35))), 0.12);
    lit += (albedo + vec3(0.08)) * vec3(0.45, 0.72, 1.0) * flashN * uLightning * 0.85;
  }

  // Linear-space emissive glow (saturated crimson PAPI red, pure white PAPI white, bright threshold green, nav lights!)
  lit += albedo * emissive * 4.6;

  if (uDisableFog < 0.5) {
    float dist = length(uCamPos - vWorldPos);
    float fogAmt = 1.0 - exp(-pow(dist * uFogDensity, 1.32));
    float heightAtten = exp(-max(vWorldPos.y - 14.0, 0.0) * 0.0028);
    float sunGlow = pow(max(dot(-V, L), 0.0), 4.0) * (1.0 - uStorm * 0.85);
    vec3 fogTarget = fogLin + sunLin * sunGlow * 0.4;
    lit = mix(lit, fogTarget, clamp(fogAmt * (0.62 + 0.38 * heightAtten), 0.0, 0.92));
  }

  outColor = vec4(toSrgb(lit), 1.0);
}`;

export const FX_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aColor;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec4 vColor;
out vec3 vWorldPos;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vColor = aColor;
  gl_Position = uViewProj * wp;
}`;

export const FX_FS = `#version 300 es
precision highp float;
in vec4 vColor;
in vec3 vWorldPos;
out vec4 outColor;
uniform vec3 uCamPos;
uniform float uFogDensity;
${COMMON_GLSL}
void main() {
  float dist = length(uCamPos - vWorldPos);
  float atten = exp(-dist * uFogDensity * 0.65);
  vec3 c = toSrgb(toLinear(vColor.rgb) * 1.35);
  outColor = vec4(c, clamp(vColor.a * atten, 0.0, 1.0));
}`;
