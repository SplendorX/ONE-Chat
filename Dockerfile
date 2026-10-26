FROM oven/bun:1.2-alpine AS builder

WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
# Build the Vite frontend (outputs to /app/dist)
RUN bun run build

# ── Runtime ────────────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine

WORKDIR /app

# Copy only what the server needs to run
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server ./server
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Serve static files from the Express server on HF Spaces port
ENV PORT=7860
EXPOSE 7860

CMD ["bun", "server/index.ts"]
