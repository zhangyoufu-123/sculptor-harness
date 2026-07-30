import pino from 'pino';

const base = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  },
});

export function phaseLogger(phase: string) {
  return base.child({ phase });
}

export function agentLogger(agentId: string) {
  return base.child({ agent: agentId });
}

export function traceLogger(category: string) {
  return base.child({ trace: category });
}

export function eventLogger(eventType: string) {
  return base.child({ event: eventType });
}

export { base as logger };
