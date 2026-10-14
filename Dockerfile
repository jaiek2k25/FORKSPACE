# FORKSPACE — production image.
#
# The application has no runtime dependencies and no build step, so this image
# exists to pin the runtime, drop privileges and keep everything that must not
# ship out of the container.
FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=5173 \
    HOST=0.0.0.0

WORKDIR /app

# Production dependencies only, resolved from the lock file. There are none at
# runtime today; keeping the step means a future dependency is installed the same
# way, and --omit=dev guarantees test tooling stays out of the image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Only what the server needs. Licensed data, the ONS spreadsheet, tests, tools and
# any .env stay out of the image (see .dockerignore).
COPY index.html package.json ./
COPY css/ ./css/
COPY src/ ./src/
COPY assets/ ./assets/
COPY server/ ./server/
# The sources page links to these, and the static handler serves /docs.
COPY docs/ ./docs/

# The process never needs to write inside the image.
RUN chown -R node:node /app
USER node

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
