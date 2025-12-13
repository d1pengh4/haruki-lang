import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SignLanguageApp from './pages/SignLanguageApp'
import './index.css'

// React Query 클라이언트 설정
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: true, // 컴포넌트 마운트 시 항상 데이터 가져오기
      retry: 2,
      staleTime: 0, // 항상 최신 데이터로 간주하여 가져오기
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SignLanguageApp />
    </QueryClientProvider>
  </StrictMode>,
)
