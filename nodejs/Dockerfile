FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src

ENV PORT=9988
EXPOSE 9988
CMD ["npm", "run", "start:tvbox"]
