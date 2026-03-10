FROM node:24-alpine AS base
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN npm install

FROM base AS build
RUN npm run build --workspace @geo-nap/common
RUN npm run build --workspace @geo-nap/recommendation-service

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/recommendation/dist ./services/recommendation/dist
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/services/recommendation/package.json ./services/recommendation/package.json
COPY --from=build /app/packages/common/package.json ./packages/common/package.json
EXPOSE 8084
CMD ["node", "services/recommendation/dist/server.js"]
