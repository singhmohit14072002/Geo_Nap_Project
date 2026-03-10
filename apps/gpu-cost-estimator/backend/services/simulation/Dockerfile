FROM node:24-alpine AS base
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN npm install

FROM base AS build
RUN npm run build --workspace @geo-nap/common
RUN npm run build --workspace @geo-nap/simulation-service

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/simulation/dist ./services/simulation/dist
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/services/simulation/package.json ./services/simulation/package.json
COPY --from=build /app/packages/common/package.json ./packages/common/package.json
EXPOSE 8083
CMD ["node", "services/simulation/dist/server.js"]
