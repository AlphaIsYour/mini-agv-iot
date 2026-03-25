FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files dulu (biar cache optimal)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# ⚠️ INI YANG PENTING → copy SEMUA file project
COPY . .

# Expose port
EXPOSE 3000
EXPOSE 3001

# Run server
CMD ["node", "server.js"]