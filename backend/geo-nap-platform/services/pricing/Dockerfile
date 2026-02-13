FROM node:24-alpine AS base
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN npm install

FROM base AS build
RUN npm run build --workspace @geo-nap/common
RUN npm run build --workspace @geo-nap/provider-adapters
RUN npm run build --workspace @geo-nap/pricing-service

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/pricing/dist ./services/pricing/dist
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/provider-adapters/dist ./packages/provider-adapters/dist
COPY --from=build /app/services/pricing/package.json ./services/pricing/package.json
COPY --from=build /app/packages/common/package.json ./packages/common/package.json
COPY --from=build /app/packages/provider-adapters/package.json ./packages/provider-adapters/package.json
EXPOSE 8082
CMD ["node", "services/pricing/dist/server.js"]
