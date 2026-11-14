# Push FlowChat to GitHub

1. Extract `flowchat-github-ready.zip`. Open a terminal inside its `flowchat` folder.
2. On GitHub, create a new **empty** repository named `flowchat`. Do not initialize it with a README or `.gitignore`.
3. Run these commands, replacing `YOUR_USERNAME` and the repository name if needed:

```bash
git init -b main
git add .
git commit -m "Initial FlowChat demo"
git remote add origin https://github.com/YOUR_USERNAME/flowchat.git
git push -u origin main
```

Use your normal GitHub sign-in/credential manager when Git requests authentication. Do not put a personal access token in source files or the remote URL.

You should push these folders: `app`, `lib`, `data`, `demo`, `public`, `scripts`, `tests`; plus all root configuration files, README, DEMO guide and package lockfile.

`.env.example` is a blank template and should be committed. Real `.env` files, dependencies, build output and private hosting metadata are excluded by the included `.gitignore`.

To check the app before pushing:

```bash
npm ci
npm test
npm run test:legacy
npm run lint
npm run build
```

To open it locally, run `npm run dev` and visit http://localhost:3000. The demo needs no API key.
