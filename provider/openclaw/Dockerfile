FROM node:22.22.0-alpine3.23@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34

ARG VCS_REVISION=unknown
LABEL org.opencontainers.image.title="MentorNest OpenClaw Provider Candidate" \
      org.opencontainers.image.version="0.3.0" \
      org.opencontainers.image.revision="${VCS_REVISION}" \
      org.opencontainers.image.source="https://github.com/pisces5250/mentornest-web-v2-preview"

WORKDIR /app
COPY package.json ./
COPY BUILD-METADATA.json ./
COPY src ./src
COPY fixtures ./fixtures

ENV NODE_ENV=production \
    PORT=18789
USER node
EXPOSE 18789
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD ["node", "src/healthcheck.mjs"]
CMD ["node", "src/server.mjs"]
