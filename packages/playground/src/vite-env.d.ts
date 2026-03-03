/// <reference types="vite/client" />

declare module 'virtual:npm-timeline' {
  const data: Record<
    string,
    { 'dist-tags': { latest: string }; time: Record<string, string> }
  >;
  export default data;
}
