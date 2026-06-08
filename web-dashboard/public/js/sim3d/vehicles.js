import * as THREE from "three";
import { S } from "./state.js";

/**
 * Vehicles and containers for the Roblox-style 3D warehouse island.
 * All box geometry for that chunky aesthetic.
 */
export function buildVehicles() {
  buildDeliveryTruck();
  buildCargoContainers();
  buildPalletJack();
  buildParkedVan();
}

// ── Delivery Truck ──────────────────────────────────────────────────────────

function buildDeliveryTruck() {
  const truck = new THREE.Group();
  truck.position.set(-70, 0, -60);

  // Cabin
  const cabinGeo = new THREE.BoxGeometry(3, 3, 3);
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(-4, 1.5, 0);
  cabin.castShadow = true;
  truck.add(cabin);

  // Windshield (on front face of cabin)
  const windshieldGeo = new THREE.BoxGeometry(2.5, 1.5, 0.1);
  const windshieldMat = new THREE.MeshStandardMaterial({
    color: 0x88bbee,
    transparent: true,
    opacity: 0.6,
  });
  const windshield = new THREE.Mesh(windshieldGeo, windshieldMat);
  windshield.position.set(-5.5, 2.25, 0);
  windshield.castShadow = false;
  truck.add(windshield);

  // Cargo body (behind cabin)
  const cargoGeo = new THREE.BoxGeometry(8, 3.5, 3);
  const cargoMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
  const cargo = new THREE.Mesh(cargoGeo, cargoMat);
  cargo.position.set(1, 1.75, 0);
  cargo.castShadow = true;
  truck.add(cargo);

  // Wheels – 6 cylinders arranged in 3 pairs
  const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

  const wheelPositions = [
    // Front pair
    [-4, 0.4, 1.65],
    [-4, 0.4, -1.65],
    // Middle pair
    [0, 0.4, 1.65],
    [0, 0.4, -1.65],
    // Rear pair
    [4, 0.4, 1.65],
    [4, 0.4, -1.65],
  ];

  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, y, z);
    wheel.rotation.x = Math.PI / 2;
    wheel.castShadow = true;
    truck.add(wheel);
  }

  // Headlights – 2 small spheres on front
  const headlightGeo = new THREE.SphereGeometry(0.2, 8, 8);
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffff00,
    emissive: 0xffff00,
    emissiveIntensity: 0.4,
  });

  const hlLeft = new THREE.Mesh(headlightGeo, headlightMat);
  hlLeft.position.set(-5.5, 1.2, 0.8);
  truck.add(hlLeft);

  const hlRight = new THREE.Mesh(headlightGeo, headlightMat);
  hlRight.position.set(-5.5, 1.2, -0.8);
  truck.add(hlRight);

  S.scene.add(truck);
}

// ── Cargo Containers ────────────────────────────────────────────────────────

function buildCargoContainers() {
  const colors = [0xff4444, 0x4488ff, 0x44aa44];
  const positions = [
    [100, 0, -20],
    [100, 2.5, -20],
    [100, 0, -16],
  ];

  for (let i = 0; i < 3; i++) {
    buildSingleContainer(positions[i], colors[i]);
  }
}

function buildSingleContainer([px, py, pz], color) {
  const container = new THREE.Group();
  container.position.set(px, py, pz);

  // Main body
  const bodyGeo = new THREE.BoxGeometry(6, 2.5, 2.5);
  const bodyMat = new THREE.MeshStandardMaterial({ color });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 1.25, 0);
  body.castShadow = true;
  container.add(body);

  // Door lines (on one end, the +x face)
  const doorLineGeo = new THREE.BoxGeometry(0.05, 2, 0.06);
  const doorLineMat = new THREE.MeshStandardMaterial({ color: 0x333333 });

  const doorLeft = new THREE.Mesh(doorLineGeo, doorLineMat);
  doorLeft.position.set(3.03, 1.25, -0.35);
  container.add(doorLeft);

  const doorRight = new THREE.Mesh(doorLineGeo, doorLineMat);
  doorRight.position.set(3.03, 1.25, 0.35);
  container.add(doorRight);

  // Corrugated texture lines – thin horizontal lines on front and sides
  const corrugGeo = new THREE.BoxGeometry(0.04, 0.06, 2.52);
  const corrugMat = new THREE.MeshStandardMaterial({ color: 0x333333 });

  for (let y = 0.6; y <= 2.0; y += 0.4) {
    const line = new THREE.Mesh(corrugGeo, corrugMat);
    line.position.set(0, y, 0);
    container.add(line);
  }

  // Side corrugation lines
  const sideCorrugGeo = new THREE.BoxGeometry(6.02, 0.06, 0.04);

  for (let y = 0.6; y <= 2.0; y += 0.4) {
    const lineFront = new THREE.Mesh(sideCorrugGeo, corrugMat);
    lineFront.position.set(0, y, 1.26);
    container.add(lineFront);

    const lineBack = new THREE.Mesh(sideCorrugGeo, corrugMat);
    lineBack.position.set(0, y, -1.26);
    container.add(lineBack);
  }

  S.scene.add(container);
}

// ── Pallet Jack ─────────────────────────────────────────────────────────────

function buildPalletJack() {
  const jack = new THREE.Group();
  jack.position.set(-40, 0, 40);

  // Body (platform)
  const bodyGeo = new THREE.BoxGeometry(1.5, 0.15, 0.8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 0.3, 0);
  body.castShadow = true;
  jack.add(body);

  // Forks – 2 parallel prongs
  const forkGeo = new THREE.BoxGeometry(0.1, 0.08, 1.5);
  const forkMat = new THREE.MeshStandardMaterial({ color: 0x888888 });

  const forkLeft = new THREE.Mesh(forkGeo, forkMat);
  forkLeft.position.set(-0.45, 0.15, 0.75);
  forkLeft.castShadow = true;
  jack.add(forkLeft);

  const forkRight = new THREE.Mesh(forkGeo, forkMat);
  forkRight.position.set(0.45, 0.15, 0.75);
  forkRight.castShadow = true;
  jack.add(forkRight);

  // Handle
  const handleGeo = new THREE.BoxGeometry(0.08, 0.8, 0.08);
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.set(0, 0.7, -0.6);
  jack.add(handle);

  // Wheels – 4 small cylinders
  const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

  const wheelPositions = [
    [-0.55, 0.12, -0.5],
    [0.55, 0.12, -0.5],
    [-0.55, 0.12, 1.2],
    [0.55, 0.12, 1.2],
  ];

  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, y, z);
    wheel.rotation.x = Math.PI / 2;
    wheel.castShadow = true;
    jack.add(wheel);
  }

  S.scene.add(jack);
}

// ── Parked Van ──────────────────────────────────────────────────────────────

function buildParkedVan() {
  const van = new THREE.Group();
  van.position.set(50, 0, 90);

  // Body (rear cargo area)
  const bodyGeo = new THREE.BoxGeometry(2.5, 2, 4);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 1, 0);
  body.castShadow = true;
  van.add(body);

  // Cabin (front)
  const cabinGeo = new THREE.BoxGeometry(2.5, 1.5, 1.5);
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, 1.75, -2.75);
  cabin.castShadow = true;
  van.add(cabin);

  // Windows (front windshield)
  const windowGeo = new THREE.BoxGeometry(2.5, 0.8, 0.1);
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x88bbee,
    transparent: true,
    opacity: 0.6,
  });
  const windows = new THREE.Mesh(windowGeo, windowMat);
  windows.position.set(0, 2.2, -3.5);
  van.add(windows);

  // Wheels – 4 cylinders
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 8);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

  const wheelPositions = [
    [-1.35, 0.35, -1.8],
    [1.35, 0.35, -1.8],
    [-1.35, 0.35, 1.5],
    [1.35, 0.35, 1.5],
  ];

  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, y, z);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    van.add(wheel);
  }

  S.scene.add(van);
}
