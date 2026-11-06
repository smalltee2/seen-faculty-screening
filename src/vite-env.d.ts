/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOGIN_API?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
