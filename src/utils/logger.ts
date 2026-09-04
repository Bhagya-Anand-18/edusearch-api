import chalk from 'chalk';

const log = (level: string, message: string, color: (msg: string) => string, ...args: any[]) => {
  const timestamp = new Date().toISOString();
  if (args.length > 0) {
    console.log(`${color(`[${timestamp}] [${level}]`)} ${message}`, ...args);
  } else {
    console.log(`${color(`[${timestamp}] [${level}]`)} ${message}`);
  }
};

export const logger = {
  info: (message: string, ...args: any[]) => log('INFO', message, chalk.blue, ...args),
  warn: (message: string, ...args: any[]) => log('WARN', message, chalk.yellow, ...args),
  error: (message: string, ...args: any[]) => log('ERROR', message, chalk.red, ...args),
  success: (message: string, ...args: any[]) => log('SUCCESS', message, chalk.green, ...args),
};
