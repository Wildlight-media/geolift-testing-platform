FROM node:20-slim AS deps
WORKDIR /srv/frontend
COPY package.json ./
RUN npm install

FROM node:20-slim AS builder
WORKDIR /srv/frontend
COPY --from=deps /srv/frontend/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /srv/frontend
ENV NODE_ENV=production
COPY --from=builder /srv/frontend/.next/standalone ./
COPY --from=builder /srv/frontend/.next/static ./.next/static
COPY --from=builder /srv/frontend/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
