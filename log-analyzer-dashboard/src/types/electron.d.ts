export {};

declare global {
  interface Window {
    electron: {
      openFile: () => Promise<string | null>;
      readFile: (buffer: ArrayBuffer) => Promise<string | null>;
    };
  }
}
