export {};

declare global {
  interface Window {
    electron: {
      openFile: () => Promise<string | null>;
    };
  }
}
