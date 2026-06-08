import * as THREE from "three";
import { S } from "./state.js";

function createTextSprite(text, color = "#ffffff", size = 1) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 256;
  canvas.height = 64;

  ctx.fillStyle = color;
  ctx.font = "Bold 48px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(4 * size, 1 * size, 1);
  return sprite;
}

export function buildWarehouse() {
  const group = new THREE.Group();
  group.position.set(60, 0, -50);

  const bodyGeometry = new THREE.BoxGeometry(30, 8, 20);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 4;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roofGeometry = new THREE.BoxGeometry(32, 0.5, 22);
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.position.y = 8.25;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const dockGeometry = new THREE.BoxGeometry(8, 3, 2);
  const dockMaterial = new THREE.MeshStandardMaterial({ color: 0x777777 });
  const dock = new THREE.Mesh(dockGeometry, dockMaterial);
  dock.position.set(0, 1.5, 11);
  dock.castShadow = true;
  dock.receiveShadow = true;
  group.add(dock);

  const doorGeometry = new THREE.BoxGeometry(6, 3, 0.1);
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
  const door = new THREE.Mesh(doorGeometry, doorMaterial);
  door.position.set(0, 1.5, 12.05);
  door.castShadow = true;
  door.receiveShadow = true;
  group.add(door);

  const textSprite = createTextSprite("WAREHOUSE", "#ffffff", 1.2);
  textSprite.position.set(0, 5, 12.5);
  group.add(textSprite);

  S.scene.add(group);
}

export function buildGuardBooth() {
  const group = new THREE.Group();
  group.position.set(-30, 0, 80);

  const bodyGeometry = new THREE.BoxGeometry(3, 2.5, 3);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 1.25;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roofGeometry = new THREE.BoxGeometry(3.5, 0.3, 3.5);
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.position.y = 2.65;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const windowGeometry = new THREE.BoxGeometry(1.5, 1, 0.1);
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x88bbee,
    transparent: true,
    opacity: 0.5,
  });
  const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);
  windowMesh.position.set(0, 1.8, 1.55);
  windowMesh.castShadow = true;
  windowMesh.receiveShadow = true;
  group.add(windowMesh);

  const doorGeometry = new THREE.BoxGeometry(0.8, 1.8, 0.1);
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
  const door = new THREE.Mesh(doorGeometry, doorMaterial);
  door.position.set(-0.7, 0.9, 1.55);
  door.castShadow = true;
  door.receiveShadow = true;
  group.add(door);

  S.scene.add(group);
}

export function buildStorageShed() {
  const group = new THREE.Group();
  group.position.set(80, 0, 60);

  const bodyGeometry = new THREE.BoxGeometry(10, 4, 8);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x996633 });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roofPlaneGeometry = new THREE.PlaneGeometry(6, 8);
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x666666,
    side: THREE.DoubleSide,
  });

  const roofLeft = new THREE.Mesh(roofPlaneGeometry, roofMaterial);
  roofLeft.position.set(-1.5, 5, 0);
  roofLeft.rotation.z = Math.PI / 6;
  roofLeft.castShadow = true;
  roofLeft.receiveShadow = true;
  group.add(roofLeft);

  const roofRight = new THREE.Mesh(roofPlaneGeometry, roofMaterial);
  roofRight.position.set(1.5, 5, 0);
  roofRight.rotation.z = -Math.PI / 6;
  roofRight.castShadow = true;
  roofRight.receiveShadow = true;
  group.add(roofRight);

  const doorGeometry = new THREE.BoxGeometry(2, 3, 0.1);
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
  const door = new THREE.Mesh(doorGeometry, doorMaterial);
  door.position.set(0, 1.5, 4.05);
  door.castShadow = true;
  door.receiveShadow = true;
  group.add(door);

  S.scene.add(group);
}

export function buildChimneys() {
  const group = new THREE.Group();
  group.position.set(40, 0, -80);

  const chimneyGeometry = new THREE.CylinderGeometry(0.5, 0.5, 8, 8);
  const chimneyMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });

  const chimney1 = new THREE.Mesh(chimneyGeometry, chimneyMaterial);
  chimney1.position.set(-3, 4, 0);
  chimney1.castShadow = true;
  chimney1.receiveShadow = true;
  group.add(chimney1);

  const chimney2 = new THREE.Mesh(chimneyGeometry, chimneyMaterial);
  chimney2.position.set(0, 4, 0);
  chimney2.castShadow = true;
  chimney2.receiveShadow = true;
  group.add(chimney2);

  const chimney3 = new THREE.Mesh(chimneyGeometry, chimneyMaterial);
  chimney3.position.set(3, 4, 0);
  chimney3.castShadow = true;
  chimney3.receiveShadow = true;
  group.add(chimney3);

  const smokeGeometry = new THREE.SphereGeometry(0.6, 8, 8);
  const smokeMaterial = new THREE.MeshStandardMaterial({
    color: 0xaaaaaa,
    transparent: true,
    opacity: 0.6,
  });

  const smoke1 = new THREE.Mesh(smokeGeometry, smokeMaterial);
  smoke1.position.set(-3, 8.5, 0);
  group.add(smoke1);

  const smoke2 = new THREE.Mesh(smokeGeometry, smokeMaterial);
  smoke2.position.set(0, 8.5, 0);
  group.add(smoke2);

  const smoke3 = new THREE.Mesh(smokeGeometry, smokeMaterial);
  smoke3.position.set(3, 8.5, 0);
  group.add(smoke3);

  S.scene.add(group);
}

export function buildBuildings() {
  buildWarehouse();
  buildGuardBooth();
  buildStorageShed();
  buildChimneys();
}
