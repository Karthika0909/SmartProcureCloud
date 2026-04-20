# ---------- build stage ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Install deps first (cached when package files haven't changed)
COPY package.json package-lock.json ./
RUN npm ci

# Build the Vue SPA
COPY . .
RUN npm run build

# ---------- serve stage ----------
FROM nginx:1.27-alpine AS runtime

# SPA + /api upstream config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static bundle
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
# Use nginx's default CMD; run as non-root via the stock nginx image's
# /docker-entrypoint.sh so port-80 binding still works in-container.
