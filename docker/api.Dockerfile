FROM node:22.14.0-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY server ./server
USER node
EXPOSE 3000
CMD ["npx", "tsx", "server/src/dev.ts"]
