interface TraceStep {
  step: string;
  detail: string;
  timestamp: string;
}

export class DebugTracer {
  private enabled: boolean;
  private steps: TraceStep[] = [];
  private indent = 0;

  constructor(enabled = false) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  begin(section: string): void {
    if (!this.enabled) return;
    const border = '='.repeat(40);
    console.log(`\n${border}`);
    console.log(`  ${section}`);
    console.log(`${border}\n`);
    this.indent = 0;
  }

  step(label: string, detail: string): void {
    const ts = new Date().toISOString();
    this.steps.push({ step: label, detail, timestamp: ts });
    if (!this.enabled) return;
    const prefix = '  '.repeat(this.indent);
    console.log(`${prefix}[${label}] ${detail}`);
  }

  command(type: string, aggregateId: string): void {
    this.step('COMMAND', `${type} → ${aggregateId}`);
  }

  permission(result: string): void {
    this.step('PERMISSION', result);
  }

  stateTransition(from: string, to: string): void {
    this.step('STATE', `${from} → ${to}`);
  }

  eventStored(type: string, version: number): void {
    this.step('EVENT', `${type} v=${version}`);
  }

  agentDispatch(agent: string, action: string): void {
    this.indent++;
    this.step('AGENT', `${agent}.${action}`);
  }

  contextBuilt(fields: string[]): void {
    this.step('CONTEXT', `loaded: ${fields.join(', ')}`);
  }

  promptRendered(template: string, varCount: number): void {
    this.step('PROMPT', `${template} (${varCount} variables)`);
  }

  llmRequest(model: string, tokens: number): void {
    this.step('LLM:REQ', `${model} (${tokens} tokens)`);
  }

  llmResponse(latency: number, tokens: number): void {
    this.step('LLM:RES', `${latency}ms, ${tokens} tokens`);
    this.indent = Math.max(0, this.indent - 1);
  }

  postAnalysis(summary: string): void {
    this.step('ANALYSIS', summary);
  }

  error(message: string): void {
    if (!this.enabled) return;
    console.log(`  ❌ ${message}`);
  }

  warn(message: string): void {
    if (!this.enabled) return;
    console.log(`  ⚠️ ${message}`);
  }

  success(message: string): void {
    if (!this.enabled) return;
    console.log(`  ✅ ${message}`);
  }

  getSteps(): TraceStep[] {
    return [...this.steps];
  }

  getTraceLog(): string {
    return this.steps.map((s) => `[${s.timestamp}] ${s.step}: ${s.detail}`).join('\n');
  }
}

export const debugTracer = new DebugTracer();
