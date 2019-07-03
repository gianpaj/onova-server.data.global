import winston from 'winston';

export default new winston.Logger({
  transports: [
    new winston.transports.Console({
      json: true,
      colorize: true,
      dumpExceptions: true,
    }),
  ],
});

export const winstonDailyRotateConfig = {
  dirname: './logs',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
};
