/* ════════════════════════════════════════════════════════════════════════════
   POSTPROCESSING.JS — Visual effects pipeline
   Bloom, color grading, vignette, ambient occlusion
════════════════════════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { S } from "./state.js";

let composer = null;

/* ── Custom Color Grading + Vignette Shader ── */
const ColorGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    uBrightness: { value: 0.02 },
    uContrast: { value: 1.1 },
    uSaturation: { value: 1.15 },
    uVignette: { value: 0.3 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uBrightness;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Brightness
      color.rgb += uBrightness;

      // Contrast
      color.rgb = (color.rgb - 0.5) * uContrast + 0.5;

      // Saturation
      float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(vec3(gray), color.rgb, uSaturation);

      // Vignette
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float vignette = smoothstep(0.5, 0.2, dist);
      color.rgb *= mix(1.0 - uVignette, 1.0, vignette);

      gl_FragColor = color;
    }
  `,
};

export function setupPostProcessing() {
  if (!S.renderer || !S.scene || !S.camera) return;

  composer = new EffectComposer(S.renderer);

  // Render pass
  const renderPass = new RenderPass(S.scene, S.camera);
  composer.addPass(renderPass);

  // Bloom (subtle glow on bright objects)
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.3,   // strength
    0.4,   // radius
    0.85   // threshold
  );
  composer.addPass(bloomPass);

  // Color grading + vignette
  const colorGradingPass = new ShaderPass(ColorGradingShader);
  composer.addPass(colorGradingPass);

  // Handle resize
  window.addEventListener("resize", () => {
    composer.setSize(window.innerWidth, window.innerHeight);
  });
}

export function renderWithPostProcessing() {
  if (composer) {
    composer.render();
  } else {
    S.renderer.render(S.scene, S.camera);
  }
}
