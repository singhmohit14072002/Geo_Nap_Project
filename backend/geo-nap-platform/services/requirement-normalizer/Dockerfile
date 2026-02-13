FROM node:24-alpine AS base
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN npm install

FROM base AS build
RUN npm run build --workspace @geo-nap/common
RUN npm run build --workspace @geo-nap/requirement-normalizer-service

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/requirement-normalizer/dist ./services/requirement-normalizer/dist
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/services/requirement-normalizer/package.json ./services/requirement-normalizer/package.json
COPY --from=build /app/packages/common/package.json ./packages/common/package.json
CMD ["node", "services/requirement-normalizer/dist/server.js"]
