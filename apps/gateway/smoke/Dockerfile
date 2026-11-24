# Stand-in for the API image in the gateway smoke run. See wrangler.jsonc here.
FROM node:22-bookworm-slim
WORKDIR /app
COPY server.mjs ./
EXPOSE 8080
CMD ["node", "server.mjs"]
