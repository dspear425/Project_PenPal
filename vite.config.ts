import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter((key) => !env[key]?.trim())

  if (missing.length > 0) {
    throw new Error(
      `Missing required build environment ${missing.length === 1 ? 'variable' : 'variables'}: ${missing.join(', ')}`,
    )
  }

  return {
    plugins: [react()],
  }
})
