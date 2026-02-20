FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY server.js ./server.js
COPY public ./public
COPY data ./data
COPY uploads ./uploads

ENV NODE_ENV=production
ENV PORT=5173
ENV HOST=0.0.0.0

EXPOSE 5173

CMD ["npm", "run", "legacy:start"]
