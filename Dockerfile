FROM node:20-slim

WORKDIR /app

# Copy all source files
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build the project (compiles frontend + backend into dist/)
RUN npm run build

# Remove dev dependencies to slim down the image
RUN npm prune --omit=dev

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "dist/index.cjs"]
