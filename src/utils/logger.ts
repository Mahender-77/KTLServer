import winston from 'winston';

const { combine, timestamp, json, printf, colorize } = winston.format;

// Basic Winston logger with console transport
const winstonLogger = winston.createLogger({
  level: 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json()
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        printf(({ timestamp, level, message, tenantId, ...meta }) => {
          const tenantPrefix = tenantId ? `[Tenant: ${tenantId}] ` : '';
          const metaString = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
          return `[${timestamp}] ${level}: ${tenantPrefix}${message}${metaString}`;
        })
      )
    })
  ]
});

export const logger = {
  info: (msg: string, ...meta: any[]) => winstonLogger.info(msg, ...meta),
  error: (msg: string, ...meta: any[]) => winstonLogger.error(msg, ...meta),
  warn: (msg: string, ...meta: any[]) => winstonLogger.warn(msg, ...meta),
  log: (msg: string, ...meta: any[]) => winstonLogger.info(msg, ...meta),
};

export default logger;
