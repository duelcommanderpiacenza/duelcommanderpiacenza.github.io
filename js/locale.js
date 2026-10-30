// The language on screen and its locale, for dates and numbers
// (toLocaleDateString & co.) — set before the first paint by every page's
// inline head script (<html lang>, partials/theme.html; js/language.js
// switches it). On its own, with no imports, so any module can use it.

export const currentLanguage = () => (document.documentElement.lang === "en" ? "en" : "it");

export const locale = () => (currentLanguage() === "en" ? "en-GB" : "it-IT");

// A text that never goes on the page (a confirm(), …) in the language on
// screen: js/i18n-en.js's dictionary when it's loaded (English), else as is.
export const translate = (text) => (typeof window.i18n === "function" ? window.i18n(text) : text);
