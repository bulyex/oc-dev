# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY src ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:24-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S slowfire && \
    adduser -S -u 1001 -G slowfire slowfire

WORKDIR /app

# Copy from builder
COPY --from=builder --chown=slowfire:slowfire /app/node_modules ./node_modules
COPY --from=builder --chown=slowfire:slowfire /app/prisma ./prisma
COPY --from=builder --chown=slowfire:slowfire /app/dist ./dist
COPY --from=builder --chown=slowfire:slowfire /app/package*.json ./

# Switch to non-root user
USER slowfire

# Expose health check port (optional, for monitoring)
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the bot
CMD ["node", "dist/index.js"]