import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  
  let appVersion = '1.0.0';
  try {
    const cargoToml = fs.readFileSync(path.resolve(__dirname, 'src-tauri/Cargo.toml'), 'utf-8');
    const versionMatch = cargoToml.match(/version\s*=\s*"([^"]+)"/);
    if (versionMatch && versionMatch[1]) {
      appVersion = versionMatch[1];
    }
  } catch (e) {
    console.error('Failed to read Cargo.toml version', e);
  }
  
  process.env.VITE_APP_VERSION = appVersion;

  return {
    plugins: [react(), tailwindcss(), viteSingleFile()],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
