# Trading Lab front-end (OpenCharts) — Railway static build + serve.
# Railway's builder runs this; nothing is built on the dev box.
# NOTE: `npm install` (not `npm ci`) because package-lock.json predates the
# CodeMirror deps added in U7 — install resolves them. `vite build` does NOT
# run tsc, so it builds through type-only issues (typecheck is a separate step).

# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund
COPY . .
# Vite inlines import.meta.env.* at build time, so the backend URL + (optional)
# creds must be present here. Backend is public; default to the live URL.
ARG VITE_API_URL=https://trading.sphinx.codes
ARG VITE_FT_USERNAME
ARG VITE_FT_PASSWORD
ENV VITE_API_URL=$VITE_API_URL \
    VITE_FT_USERNAME=$VITE_FT_USERNAME \
    VITE_FT_PASSWORD=$VITE_FT_PASSWORD
RUN npm run build

# ---- serve stage ----
FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist
ENV PORT=8080
EXPOSE 8080
# -s = SPA fallback to index.html for client routing
CMD ["sh", "-c", "serve -s dist -l ${PORT:-8080}"]
