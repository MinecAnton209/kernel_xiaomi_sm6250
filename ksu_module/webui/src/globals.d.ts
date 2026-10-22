export {};

interface KsuBridge {
  exec(command: string, options: string, callback: string): void;
  /** Absent on older managers; runs the command in the background and reports through callbacks. */
  spawn?(command: string, args: string, options: string | null, callback: string): void;
}

declare global {
  var ksu: KsuBridge | undefined;
}
