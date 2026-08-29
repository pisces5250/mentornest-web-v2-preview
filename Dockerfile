FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY deployment/nginx/default.conf.template /etc/nginx/templates/default.conf.template

ENV TUTOR_BACKEND_ORIGIN=http://tutor-backend:8787 \
    VOICE_BACKEND_ORIGIN=http://voice-backend:8502 \
    LEARNING_BACKEND_ORIGIN=http://openclaw-learning:18789 \
    NGINX_ENVSUBST_FILTER=^(TUTOR_BACKEND_ORIGIN|VOICE_BACKEND_ORIGIN|LEARNING_BACKEND_ORIGIN)$

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
