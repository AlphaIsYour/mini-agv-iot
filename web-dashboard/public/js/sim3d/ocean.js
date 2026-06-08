/* ════════════════════════════════════════════════════════════════════════════
   OCEAN.JS — Stylized Water Shader
   Custom ShaderMaterial with waves, color gradient, foam edge, reflections
════════════════════════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { S, ISLAND_RADIUS_X, ISLAND_RADIUS_Z } from "./state.js";

const OCEAN_SIZE = 800;
const OCEAN_SEGMENTS = 128;
let oceanMesh = null;

/* ── Water Shader ── */
const waterVertexShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vElevation;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Multiple wave layers
    float wave1 = sin(pos.x * 0.015 + uTime * 0.8) * 0.6;
    float wave2 = sin(pos.z * 0.02 + uTime * 1.1) * 0.4;
    float wave3 = sin((pos.x + pos.z) * 0.01 + uTime * 0.6) * 0.3;
    float wave4 = sin(pos.x * 0.04 + pos.z * 0.03 + uTime * 1.5) * 0.15;

    float elevation = wave1 + wave2 + wave3 + wave4;
    pos.y += elevation;
    vElevation = elevation;

    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const waterFragmentShader = `
  uniform float uTime;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uFoamColor;
  uniform float uIslandRadiusX;
  uniform float uIslandRadiusZ;

  varying vec2 vUv;
  varying float vElevation;
  varying vec3 vWorldPos;

  void main() {
    // Distance from island center (elliptical)
    float dist = sqrt(
      (vWorldPos.x * vWorldPos.x) / (uIslandRadiusX * uIslandRadiusX) +
      (vWorldPos.z * vWorldPos.z) / (uIslandRadiusZ * uIslandRadiusZ)
    );

    // Color gradient: shallow near island, deep far away
    float shallowFactor = smoothstep(0.8, 1.5, dist);
    vec3 baseColor = mix(uShallowColor, uDeepColor, shallowFactor);

    // Foam near shore (where dist ≈ 1.0)
    float foamEdge = smoothstep(0.95, 1.05, dist) * smoothstep(1.15, 1.05, dist);
    float foamNoise = sin(vWorldPos.x * 2.0 + uTime * 3.0) * sin(vWorldPos.z * 2.5 + uTime * 2.5);
    foamNoise = foamNoise * 0.5 + 0.5;
    float foam = foamEdge * foamNoise * 0.8;

    // Sparkle on waves
    float sparkle = pow(max(0.0, vElevation * 2.0), 3.0) * 0.3;

    // Combine
    vec3 color = mix(baseColor, uFoamColor, foam);
    color += vec3(sparkle);

    // Slight transparency variation
    float alpha = mix(0.75, 0.9, shallowFactor);

    gl_FragColor = vec4(color, alpha);
  }
`;

export function buildOcean() {
  const oceanGeo = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, OCEAN_SEGMENTS, OCEAN_SEGMENTS);
  oceanGeo.rotateX(-Math.PI / 2);

  const oceanMat = new THREE.ShaderMaterial({
    vertexShader: waterVertexShader,
    fragmentShader: waterFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uDeepColor: { value: new THREE.Color(0x0a3d5c) },
      uShallowColor: { value: new THREE.Color(0x1a8aaa) },
      uFoamColor: { value: new THREE.Color(0xd4eef7) },
      uIslandRadiusX: { value: ISLAND_RADIUS_X },
      uIslandRadiusZ: { value: ISLAND_RADIUS_Z },
    },
    transparent: true,
    side: THREE.DoubleSide,
  });

  oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.position.y = -0.3;
  S.scene.add(oceanMesh);
}

export function updateOcean(elapsed) {
  if (!oceanMesh) return;
  oceanMesh.material.uniforms.uTime.value = elapsed;
}
