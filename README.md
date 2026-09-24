# Lost & Found 92

Веб-приложение бюро находок в стиле Macintosh System 7. Проект использует Vanilla JavaScript, Vite, Firebase Authentication и Cloud Firestore.

## Запуск

```bash
npm install
npm run dev
```

Сборка для GitHub Pages:

```bash
npm run build
```

Workflow `.github/workflows/pages.yml` автоматически публикует папку `dist` после push в ветку `main`. В настройках репозитория GitHub выберите Pages → Source → GitHub Actions.

## Firebase

- Project ID: `lost-found-92-kz-0924`
- Firestore: Standard, `europe-west3`
- Authentication: Email/Password
- Правила и индексы уже развёрнуты в проекте.
- Начальный администратор: подтверждённый аккаунт `novvika1986@gmail.com`.

Для повторного развёртывания конфигурации:

```bash
npx -y firebase-tools@latest deploy --only firestore,auth
```

Для локальных эмуляторов создайте `.env.local` со строкой `VITE_USE_EMULATORS=true`, затем запустите `npm run emulators` и `npm run dev` в отдельных терминалах.
