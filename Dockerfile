FROM node:18-slim
RUN apt update && apt install -y dumb-init wget chromium     && rm -rf /var/lib/apt/lists/*
# 禁用 IPv6 - 使用容器启动时的方式
RUN echo "net.ipv6.conf.all.disable_ipv6 = 1" >> /etc/sysctl.conf && \
    echo "net.ipv6.conf.default.disable_ipv6 = 1" >> /etc/sysctl.conf && \
    echo "net.ipv6.conf.lo.disable_ipv6 = 1" >> /etc/sysctl.conf && \
    echo "net.ipv6.conf.eth0.disable_ipv6 = 1" >> /etc/sysctl.conf  
RUN useradd -m -u 10001 appuser   && mkdir -p /app/config /app/logs /app/logs/uvicorn \  
  && touch /app/logs/uvicorn/access.log /app/logs/uvicorn/error.log /app/logs/combined.log /app/logs/error.log \
  && chown -R appuser:appuser /app \
  && echo "appuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers     

WORKDIR /app

COPY package*.json ./
RUN npm install --production  
COPY . .
# 确保所有文件和目录的所有权都正确设置为 appuser
RUN chown -R appuser:appuser /app
# 修复权限问题，确保 appuser 有执行权限
RUN chmod -R 755 /app

EXPOSE 3101

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3   CMD wget -qO- http://127.0.0.1:3101/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "sysctl -w net.ipv6.conf.all.disable_ipv6=1 && sysctl -w net.ipv6.conf.default.disable_ipv6=1 && sysctl -w net.ipv6.conf.lo.disable_ipv6=1 && sysctl -w net.ipv6.conf.eth0.disable_ipv6=1 && chown -R appuser:appuser /app/config /app/logs && chmod -R 755 /app/config /app/logs && su -s /bin/sh appuser -c node app.js"]
