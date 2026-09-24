FROM node:20-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
USER appuser

EXPOSE 3000
CMD ["node", "server.js"]