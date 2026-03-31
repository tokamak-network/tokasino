import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dice: resolve(__dirname, 'dice.html'),
        coinflip: resolve(__dirname, 'coinflip.html'),
        roulette: resolve(__dirname, 'roulette.html'),
        lottery: resolve(__dirname, 'lottery.html'),
        demo: resolve(__dirname, 'demo.html'),
        setup: resolve(__dirname, 'setup.html'),
        randomness: resolve(__dirname, 'randomness.html'),
      },
    },
  },
})
