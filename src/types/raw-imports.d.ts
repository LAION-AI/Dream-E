/** Vite ?raw import suffix — loads any file as a raw string at build time */
declare module '*.md?raw' {
  const content: string;
  export default content;
}
