/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'virtual:npm-timeline' {
  const data: Record<
    string,
    { 'dist-tags': { latest: string }; time: Record<string, string> }
  >;
  export default data;
}
