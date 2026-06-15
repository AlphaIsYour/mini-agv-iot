# Deploy XORA Folio ke Vercel

Panduan ini dipakai untuk men-deploy `web-dashboard/folio` sebagai 3D simulator terpisah dari dashboard utama.

## 1. Deploy dari CLI

Jalankan dari folder `web-dashboard/folio`:

```bash
npx vercel login
npx vercel
```

Saat ditanya konfigurasi project, gunakan:

```text
Framework Preset : Vite
Build Command    : npm run build
Output Directory : dist
Install Command  : npm ci
Root Directory   : ./
```

Untuk production deploy:

```bash
npx vercel --prod
```

## 2. Environment Variables di Vercel

Minimal:

```text
VITE_GAME_PUBLIC=1
VITE_WHISPERS_COUNT=30
VITE_MUSIC=1
VITE_LOG=0
```

Opsional untuk live telemetry dari dashboard:

```text
VITE_AGV_WS_URL=wss://domain-dashboard-kamu/ws
VITE_FOLIO_PUBLIC_WS_TOKEN=samakan-dengan-dashboard
```

Catatan: jika dashboard masih HTTP biasa, browser Vercel HTTPS akan memblokir koneksi `ws://`.
Untuk live telemetry dari Vercel, dashboard sebaiknya punya HTTPS sehingga WebSocket memakai `wss://`.

## 3. Sambungkan Dashboard ke URL Vercel

Di `.env` dashboard/VPS:

```text
FOLIO_URL=https://url-folio-kamu.vercel.app
```

Jika memakai live telemetry read-only:

```text
FOLIO_PUBLIC_WS_TOKEN=samakan-dengan-VITE_FOLIO_PUBLIC_WS_TOKEN
```

Setelah mengubah `.env`, restart service dashboard.
