# ==========================================
# Stage 1: Build Frontend (Vite + React)
# ==========================================
FROM node:lts-alpine AS client-builder

WORKDIR /app/client

COPY client/package*.json ./
RUN npm install

COPY client/ ./
RUN npm run build

# ==========================================
# Stage 2: Production Server Runtime
# ==========================================
FROM node:lts-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=37685
ENV DATA_DIR=/app/data

# Persistent data directory
RUN mkdir -p /app/data

# Install production dependencies for server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev

# Copy server code
COPY server/ ./

# Copy built frontend from Stage 1 into client/dist
WORKDIR /app
COPY --from=client-builder /app/client/dist ./client/dist

# Expose web server port
EXPOSE 37685

# Start server
WORKDIR /app/server
CMD ["node", "server.js"]
