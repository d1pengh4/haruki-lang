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

// 다중 시퀀스 포맷 (v2): 여러 테이크 + 반전 증강 저장
export interface MultiSequenceData {
  v: 2;
  sequences: LandmarkFrame[][];
}

// landmarks_sequence 없는 경량 타입 (목록 표시·삭제용)
export interface SignMeta {
  id: string
  created_at: string
  updated_at: string
  name: string
  duration: number
  thumbnail?: string
}

// TypeScript 타입 정의
export interface SignLanguage {
  id: string
  created_at: string
  updated_at: string
  name: string
  // v1: LandmarkFrame[] (기존 단일 시퀀스)
  // v2: MultiSequenceData (다중 테이크 + 반전 증강)
  landmarks_sequence: LandmarkFrame[] | MultiSequenceData
  duration: number
  thumbnail?: string
}

/**
 * SignLanguage에서 모든 시퀀스를 배열로 반환 (v1/v2 포맷 모두 지원)
 */
export function getSignSequences(sign: SignLanguage): LandmarkFrame[][] {
  const ls = sign.landmarks_sequence;
  if (!ls) return [];
  // v2 포맷
  if (!Array.isArray(ls) && (ls as MultiSequenceData).v === 2) {
    return (ls as MultiSequenceData).sequences.filter(s => s.length >= 5);
  }
  // v1 포맷 (기존 단일 시퀀스)
  if (Array.isArray(ls) && ls.length >= 5) {
    return [ls as LandmarkFrame[]];
  }
  return [];
}

export interface LandmarkFrame {
  timestamp: number
  pose: Landmark[] | null
  left_hand: Landmark[] | null
  right_hand: Landmark[] | null
  face: number[] | null
  left_hand_features: number[] | null
  right_hand_features: number[] | null
  pose_features: number[] | null
  inter_hand_features?: number[] | null // 양손 상호작용 (선택, 구버전 호환)
}

export interface LandmarksDetected {
  timestamp: number
  pose: Landmark[] | null
  leftHand: Landmark[] | null
  rightHand: Landmark[] | null
  face: number[] | null
  leftHandFeatures: number[] | null
  rightHandFeatures: number[] | null
  poseFeatures: number[] | null
  interHandFeatures?: number[] | null // 양손 상호작용 (선택)
}

export interface Landmark {
  x: number
  y: number
  z: number
  visibility?: number
}
