import { supabase, type SignLanguage, type SignMeta } from '@/lib/supabaseClient'

/**
 * Base44 호환 API 클라이언트
 * 기존 코드의 base44.entities.SignLanguage.* API를 그대로 사용할 수 있도록 Supabase를 래핑
 */
export const base44 = {
  entities: {
    SignLanguage: {
      /**
       * 수화 목록 조회
       * @param sort - 정렬 기준 (예: '-created_at', 'name')
       * @returns 수화 목록
       */
      // landmarks_sequence 없이 메타데이터만 조회 (빠름, 목록 표시용)
      listMeta: async (sort = '-created_at'): Promise<SignMeta[]> => {
        const isDescending = sort.startsWith('-')
        const column = isDescending ? sort.slice(1) : sort
        const { data, error } = await supabase
          .from('sign_languages')
          .select('id,name,thumbnail,duration,created_at,updated_at')
          .order(column, { ascending: !isDescending })
        if (error) {
          console.error('수화 메타 조회 오류:', error)
          throw new Error(`수화 메타 조회 실패: ${error.message}`)
        }
        return data || []
      },

      // 전체 데이터 조회 (landmarks_sequence 포함, 인식용)
      list: async (sort = '-created_at'): Promise<SignLanguage[]> => {
        // '-created_at' -> { column: 'created_at', ascending: false }
        const isDescending = sort.startsWith('-')
        const column = isDescending ? sort.slice(1) : sort

        const { data, error } = await supabase
          .from('sign_languages')
          .select('*')
          .order(column, { ascending: !isDescending })

        if (error) {
          console.error('수화 목록 조회 오류:', error)
          throw new Error(`수화 목록 조회 실패: ${error.message}`)
        }

        return data || []
      },

      /**
       * 새로운 수화 생성
       * @param payload - 수화 데이터
       * @returns 생성된 수화
       */
      create: async (payload: Omit<SignLanguage, 'id' | 'created_at' | 'updated_at'>): Promise<SignLanguage> => {
        const { data, error } = await supabase
          .from('sign_languages')
          .insert([payload])
          .select()
          .single()

        if (error) {
          console.error('수화 생성 오류:', error)
          throw new Error(`수화 생성 실패: ${error.message}`)
        }

        if (!data) {
          throw new Error('수화 생성 후 데이터를 받지 못했습니다.')
        }

        return data
      },

      /**
       * 수화 삭제
       * @param id - 삭제할 수화 ID
       * @returns 성공 여부
       */
      delete: async (id: string): Promise<{ success: boolean }> => {
        const { error } = await supabase
          .from('sign_languages')
          .delete()
          .eq('id', id)

        if (error) {
          console.error('수화 삭제 오류:', error)
          throw new Error(`수화 삭제 실패: ${error.message}`)
        }

        return { success: true }
      },

      /**
       * 수화 업데이트 (추가 기능)
       * @param id - 업데이트할 수화 ID
       * @param payload - 업데이트할 데이터
       * @returns 업데이트된 수화
       */
      update: async (id: string, payload: Partial<Omit<SignLanguage, 'id' | 'created_at' | 'updated_at'>>): Promise<SignLanguage> => {
        const { data, error } = await supabase
          .from('sign_languages')
          .update(payload)
          .eq('id', id)
          .select()
          .single()

        if (error) {
          console.error('수화 업데이트 오류:', error)
          throw new Error(`수화 업데이트 실패: ${error.message}`)
        }

        if (!data) {
          throw new Error('수화 업데이트 후 데이터를 받지 못했습니다.')
        }

        return data
      },

      /**
       * ID로 수화 조회 (추가 기능)
       * @param id - 조회할 수화 ID
       * @returns 수화 데이터
       */
      get: async (id: string): Promise<SignLanguage | null> => {
        const { data, error } = await supabase
          .from('sign_languages')
          .select('*')
          .eq('id', id)
          .single()

        if (error) {
          console.error('수화 조회 오류:', error)
          throw new Error(`수화 조회 실패: ${error.message}`)
        }

        return data
      },
    },
  },
}
