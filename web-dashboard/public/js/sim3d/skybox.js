/* ════════════════════════════════════════════════════════════════════════════
   SKYBOX.JS — Gradient sky sphere
   Large inverted sphere with gradient from horizon to zenith
════════════════════════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { S } from "./state.js";

export function buildSkybox() {
  const skyGeo = new THREE.SphereGeometry(500, 32, 32);

  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTopColor: { value: new THREE.Color(0x4488cc) },
      uBottomColor: { value: new THREE.Color(0x87ceeb) },
      uHorizonColor: { value: new THREE.Color(0xc8e0f0) },
      uOffset: { value: 10 },
      uExponent: { value: 0.6 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uBottomColor;
      uniform vec3 uHorizonColor;
      uniform float uOffset;
      uniform float uExponent;
      varying vec3 vWorldPosition;

      void main() {
        float h = normalize(vWorldPosition + uOffset).y;
        float t = max(pow(max(h, 0.0), uExponent), 0.0);

        // Blend: bottom → horizon → top
        vec3 color;
        if (t < 0.3) {
          color = mix(uBottomColor, uHorizonColor, t / 0.3);
        } else {
          color = mix(uHorizonColor, uTopColor, (t - 0.3) / 0.7);
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const sky = new THREE.Mesh(skyGeo, skyMat);
  S.scene.add(sky);
}
