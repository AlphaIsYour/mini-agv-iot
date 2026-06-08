/* ── Destructible Name Statues ── */

import * as THREE from "three";
import { S } from "../state.js";
import { makeTextSprite } from "../arena.js";

export function buildDestructibleStatues() {
  const names = [
    { text: "XORA", color: 0xff8800, x: -12, z: -12 },
    { text: "DZAKI", color: 0x4488ff, x: -8, z: 14 },
    { text: "ALPHA", color: 0x44ff88, x: -15, z: 8 },
    { text: "DERBY", color: 0xff4488, x: -10, z: -15 },
    { text: "ILYAS", color: 0xaa44ff, x: -13, z: 0 },
  ];

  names.forEach((n) => {
    buildNameStatue(n.text, n.color, n.x, n.z);
  });
}

function buildNameStatue(name, color, baseX, baseZ) {
  const statueGroup = new THREE.Group();
  const letterMeshes = [];

  // Build each letter as a solid 3D block
  let offsetX = 0;
  const letterWidth = 1.0;
  const letterHeight = 1.5;
  const letterDepth = 0.6;
  const gap = 0.3;

  for (let ci = 0; ci < name.length; ci++) {
    const letter = build3DLetter(name[ci], letterWidth, letterHeight, letterDepth, color);
    letter.position.set(offsetX, letterHeight / 2 + 0.3, 0);
    letter.castShadow = true;
    letter.receiveShadow = true;
    letter.userData = {
      type: "statue-letter",
      originalPos: letter.position.clone(),
      originalRot: new THREE.Euler(0, 0, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      angularVel: new THREE.Vector3(0, 0, 0),
      broken: false,
      breakTime: 0,
    };
    statueGroup.add(letter);
    letterMeshes.push(letter);
    offsetX += letterWidth + gap;
  }

  // Base pedestal
  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(offsetX + 0.4, 0.3, 1.0),
    new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5, metalness: 0.5 })
  );
  pedestal.position.set(offsetX / 2 - gap / 2, 0.15, 0);
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  statueGroup.add(pedestal);

  // Name label
  const label = makeTextSprite(name, color);
  label.position.set(offsetX / 2 - gap / 2, letterHeight + 1.0, 0);
  label.scale.set(2.5, 1.2, 1);
  statueGroup.add(label);

  statueGroup.position.set(baseX, 0, baseZ);
  S.scene.add(statueGroup);

  S.destructibleStatues.push({
    group: statueGroup,
    letters: letterMeshes,
    brokenLetters: [],
    breakTime: 0,
    name: name,
  });
}

/* ── Build a single 3D block letter ── */
function build3DLetter(ch, w, h, d, color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: color, emissive: color, emissiveIntensity: 0.12,
    roughness: 0.35, metalness: 0.15,
  });

  const strokeW = w * 0.22; // stroke thickness
  const strokeH = h;

  // Letter shapes using box segments
  // Each letter: vertical bars, horizontal bars
  const segments = getLetterSegments(ch, w, h, d, strokeW);
  segments.forEach((seg) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(seg.w, seg.h, seg.d || d),
      mat
    );
    mesh.position.set(seg.x, seg.y, seg.z || 0);
    mesh.castShadow = true;
    group.add(mesh);
  });

  return group;
}

/* ── Letter segment definitions (box-based 3D letters) ── */
function getLetterSegments(ch, w, h, d, sw) {
  const hw = w / 2, hh = h / 2, shw = sw / 2;
  const mid = h * 0.45;

  switch (ch) {
    case "X": return [
      { w: sw, h: h, x: -hw + shw, y: 0 },   // left diagonal (approx)
      { w: sw, h: h, x: hw - shw, y: 0 },
      { w: sw * 2.5, h: sw, x: 0, y: 0 },    // center cross
    ];
    case "O": return [
      { w: sw, h: h, x: -hw + shw, y: 0 },   // left
      { w: sw, h: h, x: hw - shw, y: 0 },     // right
      { w: w, h: sw, x: 0, y: -hh + shw },    // bottom
      { w: w, h: sw, x: 0, y: hh - shw },      // top
    ];
    case "R": return [
      { w: sw, h: h, x: -hw + shw, y: 0 },   // left vertical
      { w: w * 0.6, h: sw, x: hw * 0.2, y: hh - shw }, // top
      { w: w * 0.6, h: sw, x: hw * 0.2, y: mid },      // middle
      { w: sw, h: h * 0.45, x: hw - shw, y: hh * 0.55 }, // right top
      { w: sw, h: h * 0.45, x: hw * 0.5, y: -hh * 0.3 }, // leg
    ];
    case "A": return [
      { w: sw, h: h, x: -hw + shw, y: 0 },   // left
      { w: sw, h: h, x: hw - shw, y: 0 },     // right
      { w: w * 0.7, h: sw, x: 0, y: hh - shw }, // top
      { w: w * 0.7, h: sw, x: 0, y: mid },      // middle crossbar
    ];
    case "D": return [
      { w: sw, h: h, x: -hw + shw, y: 0 },   // left vertical
      { w: sw, h: h * 0.4, x: hw * 0.6, y: hh * 0.5 },  // right top
      { w: sw, h: h * 0.4, x: hw * 0.6, y: -hh * 0.5 }, // right bottom
      { w: w * 0.5, h: sw, x: hw * 0.2, y: hh - shw },  // top
      { w: w * 0.5, h: sw, x: hw * 0.2, y: -hh + shw }, // bottom
    ];
    case "Z": return [
      { w: w, h: sw, x: 0, y: hh - shw },    // top
      { w: w, h: sw, x: 0, y: -hh + shw },   // bottom
      { w: sw * 2, h: h * 0.7, x: 0, y: 0 }, // diagonal (approx)
    ];
    case "K": return [
      { w: sw, h: h, x: -hw + shw, y: 0 },   // left vertical
      { w: sw * 2, h: h * 0.35, x: hw * 0.3, y: hh * 0.45 }, // top right
      { w: sw * 2, h: h * 0.35, x: hw * 0.3, y: -hh * 0.45 }, // bottom right
    ];
    case "I": return [
      { w: w * 0.8, h: sw, x: 0, y: hh - shw }, // top
      { w: w * 0.8, h: sw, x: 0, y: -hh + shw }, // bottom
      { w: sw, h: h, x: 0, y: 0 },                // center vertical
    ];
    case "L": return [
      { w: sw, h: h, x: -hw + shw, y: 0 },   // left vertical
      { w: w * 0.7, h: sw, x: hw * 0.15, y: -hh + shw }, // bottom
    ];
    case "P": return [
      { w: sw, h: h, x: -hw + shw, y: 0 },   // left vertical
      { w: w * 0.6, h: sw, x: hw * 0.2, y: hh - shw }, // top
      { w: w * 0.6, h: sw, x: hw * 0.2, y: mid },      // middle
      { w: sw, h: h * 0.4, x: hw - shw, y: hh * 0.55 }, // right top
    ];
    case "H": return [
      { w: sw, h: h, x: -hw + shw, y: 0 },   // left
      { w: sw, h: h, x: hw - shw, y: 0 },     // right
      { w: w * 0.7, h: sw, x: 0, y: 0 },      // middle crossbar
    ];
    case "Y": return [
      { w: sw, h: h * 0.5, x: -hw * 0.5, y: hh * 0.4 }, // top left
      { w: sw, h: h * 0.5, x: hw * 0.5, y: hh * 0.4 },  // top right
      { w: sw, h: h * 0.6, x: 0, y: -hh * 0.2 },        // stem
    ];
    case "S": return [
      { w: w * 0.6, h: sw, x: hw * 0.1, y: hh - shw },  // top
      { w: w * 0.6, h: sw, x: hw * 0.1, y: 0 },          // middle
      { w: w * 0.6, h: sw, x: hw * 0.1, y: -hh + shw }, // bottom
      { w: sw, h: h * 0.35, x: -hw * 0.4, y: hh * 0.55 }, // left top
      { w: sw, h: h * 0.35, x: hw * 0.4, y: -hh * 0.55 }, // right bottom
    ];
    case "B": return [
      { w: sw, h: h, x: -hw + shw, y: 0 },   // left vertical
      { w: w * 0.6, h: sw, x: hw * 0.2, y: hh - shw }, // top
      { w: w * 0.6, h: sw, x: hw * 0.2, y: 0 },        // middle
      { w: w * 0.6, h: sw, x: hw * 0.2, y: -hh + shw }, // bottom
      { w: sw, h: h * 0.4, x: hw - shw, y: hh * 0.55 }, // right top
      { w: sw, h: h * 0.4, x: hw - shw, y: -hh * 0.55 }, // right bottom
    ];
    default: return [
      { w: w * 0.8, h: h * 0.8, x: 0, y: 0 }, // fallback: solid block
    ];
  }
}
