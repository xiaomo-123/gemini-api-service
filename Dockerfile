FROM node:18-slim
RUN apt update && apt install -y dumb-init wget chromium     && rm -rf /var/lib/apt/lists/*  
RUN useradd -m -u 10001 appuser   && mkdir -p /app/config /app/logs \  
  && chown -R appuser:appuser /app     

WORKDIR /app

COPY package*.json ./
RUN npm install --production  
COPY . .
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 3101

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3   CMD wget -qO- http://127.0.0.1:3101/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "app.js"]
