const locales = {
  zh: {
    title: 'YX图片去水印',
    subtitle: '纯本地处理，保护您的隐私',
    upload: '上传图片',
    uploadHint: '支持 JPG / PNG / WebP 格式',
    uploadTitle: '点击上传图片或直接拖拽到画布',
    undo: '撤销',
    clear: '清除',
    process: '去水印',
    compare: '对比原图',
    showResult: '查看结果',
    export: '导出结果',
    tip: '选区越小，速度越快，效果越好哦',
    dropHint: '拖拽或点击上传图片',
    statusIdle: '等待上传图片...',
    statusLoaded: '图片已加载 · {count} 个选区',
    statusProcessing: '正在去水印...',
    statusCompleted: '去水印完成 ✓',
    statusError: '处理出错，请重试',
    zoom: '缩放: {pct}%',
    langSwitcher: 'EN',
  },
  en: {
    title: 'YX Watermark Remover',
    subtitle: '100% local processing, privacy safe',
    upload: 'Upload Image',
    uploadHint: 'Supports JPG / PNG / WebP',
    uploadTitle: 'Click to upload or drag & drop',
    undo: 'Undo',
    clear: 'Clear',
    process: 'Remove Watermark',
    compare: 'Compare',
    showResult: 'View Result',
    export: 'Export',
    tip: 'Smaller selection = faster & better result',
    dropHint: 'Drag or click to upload image',
    statusIdle: 'Waiting for image...',
    statusLoaded: 'Image loaded · {count} selection(s)',
    statusProcessing: 'Processing...',
    statusCompleted: 'Done ✓',
    statusError: 'Error, please retry',
    zoom: 'Zoom: {pct}%',
    langSwitcher: '中',
  },
}

function detectLocale() {
  const lang = (navigator.language || navigator.userLanguage || '').toLowerCase()
  return lang.startsWith('zh') ? 'zh' : 'en'
}

let currentLocale = detectLocale()

document.addEventListener('DOMContentLoaded', () => applyDataI18n())

export function t(key, args) {
  const text = locales[currentLocale]?.[key] ?? locales.zh[key] ?? key
  if (!args) return text
  return text.replace(/\{(\w+)\}/g, (_, k) => args[k] ?? `{${k}}`)
}

export function getLocale() {
  return currentLocale
}

export function setLocale(locale) {
  if (!locales[locale]) return
  currentLocale = locale
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'
  applyDataI18n()
  document.dispatchEvent(new CustomEvent('localechange', { detail: { locale } }))
}

export function toggleLocale() {
  setLocale(currentLocale === 'zh' ? 'en' : 'zh')
}

function applyDataI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n
    const text = t(key)
    if (el.children.length > 0) {
      const nodes = Array.from(el.childNodes)
      const textNode = nodes.find(n => n.nodeType === 3 && n.textContent.trim())
      if (textNode) textNode.textContent = ' ' + text
    } else {
      el.textContent = text
    }
    if (el.dataset.i18nTitle) {
      el.title = t(el.dataset.i18nTitle)
    }
  })
}
