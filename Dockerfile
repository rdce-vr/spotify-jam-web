# ==========================================
# Stage 1: Build Frontend (Vite + React)
# ==========================================
FROM node:22-alpine AS client-builder

WORKDIR /app/client

COPY client/package*.json ./
RUN npm install

COPY client/ ./
RUN npm run build

# ==========================================
# Stage 2: Production Server Runtime
# ==========================================
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

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
EXPOSE 5000

# Start server
WORKDIR /app/server
CMD ["node", "server.js"]
