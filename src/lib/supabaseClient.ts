import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase URL과 Anon Key가 필요합니다. .env.local 파일을 확인해주세요.\n' +
    'VITE_SUPABASE_URL=your-project-url\n' +
    'VITE_SUPABASE_ANON_KEY=your-anon-key'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// TypeScript 타입 정의
export interface SignLanguage {
  id: string
  created_at: string
  updated_at: string
  name: string
  landmarks_sequence: LandmarkFrame[]
  duration: number
  thumbnail?: string
}

export interface LandmarkFrame {
  timestamp: number
  pose: Landmark[] | null
  left_hand: Landmark[] | null
  right_hand: Landmark[] | null
  face: Landmark[] | null
  left_hand_features: number[] | null
  right_hand_features: number[] | null
  pose_features: number[] | null
}

export interface Landmark {
  x: number
  y: number
  z: number
  visibility?: number
}
