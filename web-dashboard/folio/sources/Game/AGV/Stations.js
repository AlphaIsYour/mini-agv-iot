/**
 * Stations.js — Visual marker untuk 4 station AGV: BASE, A, B, C
 * Menggunakan Three.js dari folio-2025 (sudah tersedia via import)
 */
import * as THREE from "three/webgpu";
import { Game } from "../Game.js";

// Koordinat station di world XORA
// Jalankan game, aktifkan debug (tekan H), cari area flat yang kosong
// lalu update koordinat ini
const STATIONS = {
  BASE: { x: 0, z: 10, color: 0x4488ff, label: "STN BASE" },
  A: { x: 0, z: -5, color: 0x00cc66, label: "STN A" },
  B: { x: 15, z: -20, color: 0xffaa00, label: "STN B" },
  C: { x: -15, z: -35, color: 0xff4466, label: "STN C" },
};

export class Stations {
  constructor() {
    this.game = Game.getInstance();
    this.items = {};

    for (const [name, cfg] of Object.entries(STATIONS)) {
      this.items[name] = this._build(name, cfg);
    }

    // Highlight station aktif saat destination berubah
    this.game.agvState.events.on("destinationChange", (dest) => {
      this._highlight(dest);
    });

    // Highlight berdasarkan state awal
    this._highlight(this.game.agvState.destination);
  }

  _build(name, cfg) {
    const group = new THREE.Group();
    group.position.set(cfg.x, 0, cfg.z);

    // Platform
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.05, 32),
      new THREE.MeshStandardMaterial({
        color: cfg.color,
        emissive: cfg.color,
        emissiveIntensity: 0.3,
        roughness: 0.4,
      }),
    );
    platform.receiveShadow = true;
    group.add(platform);

    // Ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.8, 0.05, 8, 32),
      new THREE.MeshBasicMaterial({ color: cfg.color }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    group.add(ring);

    // Point light
    const light = new THREE.PointLight(cfg.color, 2, 6);
    light.position.y = 1;
    group.add(light);

    this.game.scene.add(group);
    return { group, platform, ring, light, cfg };
  }

  _highlight(activeName) {
    for (const [name, station] of Object.entries(this.items)) {
      const isActive = name === activeName;
      station.light.intensity = isActive ? 5 : 2;
      station.platform.material.emissiveIntensity = isActive ? 1.0 : 0.3;
    }
  }

  update(elapsed) {
    for (const station of Object.values(this.items)) {
      station.ring.rotation.z = elapsed * 0.5;
    }
  }
}
