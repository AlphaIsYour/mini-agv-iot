FROM node:20-alpine

# Set to production environment
ENV NODE_ENV=production

# Create a non-root user for security
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# Set working directory
WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy application code
COPY --chown=nodejs:nodejs . .

# Switch to the non-root user
USER nodejs

# Expose required ports (HTTP and WebSocket)
EXPOSE 3000
EXPOSE 3001

# Add Healthcheck to ensure container is healthy
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/login || exit 1

# Start the application
CMD ["node", "server.js"]