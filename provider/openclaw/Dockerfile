FROM node:22.22.0-alpine3.23@sha256:fb79eb7e85a363500938daef295b4f7f423bc487f643eb25d351f12cb80178df

ARG VCS_REVISION=unknown
LABEL org.opencontainers.image.title="MentorNest OpenClaw Provider Candidate" \
      org.opencontainers.image.version="0.2.0" \
      org.opencontainers.image.revision="${VCS_REVISION}" \
      org.opencontainers.image.source="https://github.com/pisces5250/mentornest-web-v2-preview"

WORKDIR /app
COPY package.json ./
COPY BUILD-METADATA.json ./
COPY src ./src

ENV NODE_ENV=production \
    PORT=18789
USER node
EXPOSE 18789
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD ["node", "src/healthcheck.mjs"]
CMD ["node", "src/server.mjs"]
