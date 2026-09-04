FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npx tsc

# Seed the database at build time
RUN node dist/db/seed.js

EXPOSE 3000

CMD ["node", "dist/index.js"]
