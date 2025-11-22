/// <reference types="vite/client" />

interface ImportMeta {
  readonly env: {
    VITE_SUPABASE_URL?: string
    VITE_SUPABASE_ANON_KEY?: string
    [key: string]: any
  }
}

interface Window {
  Holistic?: any
  Camera?: any
  drawConnectors?: any
  drawLandmarks?: any
  POSE_CONNECTIONS?: any
  HAND_CONNECTIONS?: any
}
