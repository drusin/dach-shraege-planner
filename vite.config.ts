import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  // relative base works for GitHub project/user pages and local preview
  base: './',
  plugins: [vue()],
})
