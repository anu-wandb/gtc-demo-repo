# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:18-alpine AS builder
WORKDIR /app

# Accept build-time env var (baked into the Next.js bundle)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package*.json ./
# Strip Mac-only swc binary from package.json before installing on Linux
RUN sed -i '/@next\/swc-darwin-arm64/d' package.json && \
    npm install --legacy-peer-deps

COPY . .
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node_modules/.bin/next", "start", "-p", "3000"]
