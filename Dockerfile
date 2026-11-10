FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm ci

FROM build AS api
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build -w @helpdesk/api
EXPOSE 4000
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && npm run start -w @helpdesk/api"]

FROM build AS web
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @helpdesk/web
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@helpdesk/web", "--", "--hostname", "0.0.0.0"]
