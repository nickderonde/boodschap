// Logger die alles bewaart, voor de NF-01/NF-05-scans van logs.
import type { LogData, Logger } from '../../src/core/types';

export class CapturingLogger implements Logger {
  readonly lines: { level: string; code: string; data?: LogData }[] = [];
  info(code: string, data?: LogData): void {
    this.lines.push({ level: 'info', code, data });
  }
  warn(code: string, data?: LogData): void {
    this.lines.push({ level: 'warn', code, data });
  }
  error(code: string, data?: LogData): void {
    this.lines.push({ level: 'error', code, data });
  }
  text(): string {
    return JSON.stringify(this.lines);
  }
  codes(): string[] {
    return this.lines.map((l) => l.code);
  }
}
