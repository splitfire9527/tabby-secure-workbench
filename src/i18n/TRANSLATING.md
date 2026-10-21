# Community Translation Guide / 社区翻译指南

Tabby Secure Workbench provides an extensible i18n localization system. We welcome community translations for additional languages (e.g., Japanese, Traditional Chinese, German, Spanish, French, etc.).

## How to add a new language:

1. Create a new locale file in `src/i18n/locales/<locale-code>.ts` (e.g. `ja-JP.ts`).
2. Copy the structure from `src/i18n/locales/en-US.ts` or `src/i18n/locales/zh-CN.ts`.
3. Register the new locale in `src/i18n/i18n.service.ts`:
   ```typescript
   import { jaJP } from './locales/ja-JP'

   this.registerLocale('ja-JP', jaJP)
   ```
4. Add the option to `UILanguage` in `src/config/config.model.ts` and settings dropdown in `src/shell/workbench-modals.component.ts`.
5. Run `npm test && npm run build` to verify.
