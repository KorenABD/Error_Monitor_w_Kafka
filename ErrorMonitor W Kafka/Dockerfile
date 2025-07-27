FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# Wait longer for Kafka to be ready
CMD ["sh", "-c", "sleep 15 && npm run migrate && npm start"]