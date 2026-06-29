FROM node:20-alpine

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173
ENV DATA_DIR=/data

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /data && chown -R node:node /app /data

USER node

EXPOSE 4173

CMD ["npm", "start"]
