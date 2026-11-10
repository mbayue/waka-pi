/**
 * Shared Extension API types for Pi and Oh-My-Pi (omp).
 */

export interface ExtensionContext {
  cwd?: string;
  hasUI?: boolean;
  ui?: {
    notify: (message: string, level?: "info" | "warning" | "error") => void;
  };
}

export interface BeforeAgentStartEvent {
  messageType?: "user" | "system" | "agent" | string;
  prompt?: string;
  [key: string]: unknown;
}

export interface ToolResultEvent {
  type?: "tool_result" | string;
  toolCallId?: string;
  toolName: string;
  input?: Record<string, unknown>;
  content?: unknown[];
  isError?: boolean;
  details?: unknown;
  [key: string]: unknown;
}

export interface CommandOptions {
  description: string;
  handler: (args: string, ctx: ExtensionContext) => Promise<void> | void;
}

export interface ExtensionAPI {
  on(event: "session_start", handler: (event: unknown, ctx: ExtensionContext) => void): void;
  on(event: "before_agent_start", handler: (event: BeforeAgentStartEvent, ctx: ExtensionContext) => void): void;
  on(event: "tool_result", handler: (event: ToolResultEvent, ctx: ExtensionContext) => void): void;
  on(event: "session_shutdown", handler: (event: unknown, ctx: ExtensionContext) => void): void;
  on(event: string, handler: (event: any, ctx: ExtensionContext) => void): void;

  registerCommand(name: string, options: CommandOptions): void;
  [key: string]: unknown;
}
