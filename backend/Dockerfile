FROM node:20-alpine

WORKDIR /app

# Install production deps only (cached on package file changes)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# App source
COPY . .

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Drop root — node:20-alpine ships with a "node" user
USER 1000
CMD ["node", "index.js"]