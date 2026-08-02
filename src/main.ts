import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { loadLocale, detectLocale } from './i18n'
import de from './i18n/de.json'
import en from './i18n/en.json'

const locale = detectLocale()
loadLocale(locale === 'de' ? de : en, locale)

createApp(App).mount('#app')
