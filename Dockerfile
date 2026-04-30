FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN npm ci --silent

COPY . .

RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4100
ENV SCORING_FRONTEND_DIST=/app/frontend/dist

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend ./backend
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/docs ./docs

RUN mkdir -p /data/scoring/storage/projects /data/scoring/tmp/analysis-jobs /data/scoring/mvp \
  && chown -R node:node /app /data/scoring

USER node

EXPOSE 4100

CMD ["npm", "run", "start", "--workspace", "backend"]
