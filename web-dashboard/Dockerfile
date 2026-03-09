# Gunakan base image Node.js versi ringan
FROM node:20-alpine

# Set working directory di dalam container
WORKDIR /app

# Salin package.json dan package-lock.json (jika ada)
COPY package*.json ./

# Install dependencies Node.js
RUN npm install --production

# Salin script server.js
COPY server.js ./

# Expose port WebSocket (sesuai konfigurasi di server.js: 3001)
EXPOSE 3001

# Jalankan server
CMD ["node", "server.js"]
