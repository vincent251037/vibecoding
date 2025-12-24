
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 注意：請將 'REPLACE_WITH_YOUR_REPO_NAME' 替換為您的 GitHub 儲存庫名稱
export default defineConfig({
  plugins: [react()],
  base: '/vibecoding/', // 使用相對路徑以相容於 GitHub Pages
  define: {
    'process.env': {} // 確保 process.env 物件存在，避免執行期錯誤
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  }
});
