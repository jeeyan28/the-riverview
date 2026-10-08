import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

function bootstrapUsage() {
  const directory = fileURLToPath(new URL('./src', import.meta.url))
  const sources = []
  function read(folder) {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      const name = path.join(folder, item.name)
      if (item.isDirectory()) read(name)
      else if (/\.[jt]sx?$/.test(item.name)) sources.push(readFileSync(name, 'utf8'))
    }
  }
  read(directory)
  sources.push(readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)), 'utf8'))
  const tokens = new Set(sources.join(' ').match(/[a-zA-Z][\w-]*/g) || [])
  const dynamicPrefixes = [...tokens].filter(token => token.endsWith('-'))
  return {
    postcssPlugin: 'riverview-bootstrap-usage',
    Once(root) {
      if (!root.source?.input?.file?.replaceAll('\\', '/').endsWith('/bootstrap/dist/css/bootstrap.min.css')) return
      root.walkRules(rule => {
        const selectors = rule.selectors.filter(selector => {
          const classes = [...selector.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => match[1])
          return classes.every(name => tokens.has(name) || dynamicPrefixes.some(prefix => name.startsWith(prefix)))
        })
        if (!selectors.length) rule.remove()
        else rule.selectors = selectors
      })
      root.walkAtRules(rule => { if (rule.nodes && !rule.nodes.length) rule.remove() })
    },
  }
}

const apiProxyTarget = process.env.APP_MODE === 'demo'
  ? `http://127.0.0.1:${process.env.DEMO_API_PORT || '3000'}`
  : 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [bootstrapUsage()] } },
  server: {
    port: 5501,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5501,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})
