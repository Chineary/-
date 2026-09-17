import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'./',plugins:[react()],build:{chunkSizeWarningLimit:1000,rollupOptions:{output:{manualChunks(id){if(id.includes('/node_modules/echarts/')||id.includes('/node_modules/zrender/'))return 'charts';if(id.includes('/node_modules/react-markdown/'))return 'markdown';}}}}});
