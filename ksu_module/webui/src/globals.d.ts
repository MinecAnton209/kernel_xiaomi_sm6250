export {};

interface KsuBridge {
  exec(command: string, options: string, callback: string): void;
}

declare global {
  var ksu: KsuBridge | undefined;
}
