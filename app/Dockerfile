# ===========================
# Stage 1: Builder
# ===========================
FROM node:18-bullseye-slim AS builder
WORKDIR /app

# Copy package & tsconfig for caching
COPY package*.json tsconfig.json ./

# Install all deps (including dev for TypeScript)
RUN npm ci

# Copy the rest of the source code
COPY src ./src

# Build the TypeScript project (outputs /app/dist)
RUN npm run build && ls -R /app/dist

# ===========================
# Stage 2: Runtime
# ===========================
FROM node:18-bullseye-slim
WORKDIR /app

# Copy only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled build from builder
COPY --from=builder /app/dist ./dist

# Optional sanity check for debugging
RUN ls -R /app/dist

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD curl -f http://localhost:3000/health || exit 1

#  Correct entry point
CMD ["node", "dist/server.js"]
