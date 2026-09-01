FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY README.md SKILL.md LICENSE ./

# Never root. The container holds a credential that can read a site's entire
# search history.
USER node

EXPOSE 8000
# 0.0.0.0 inside a container is normal, and the server still refuses to start
# without GSC_HTTP_TOKEN, so this cannot be exposed unauthenticated by accident.
CMD ["node", "dist/index.js", "--http", "--host", "0.0.0.0", "--port", "8000"]
