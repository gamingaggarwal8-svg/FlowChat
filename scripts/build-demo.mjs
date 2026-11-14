import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs','scripts/prepare-operations.ts'], {stdio:'inherit'});
import { build } from 'esbuild';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive:true });
await build({entryPoints:['demo/entry.tsx'],bundle:true,outdir:'dist',entryNames:'app',minify:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},target:['es2020'],legalComments:'none'});
await writeFile('dist/index.html','<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#236149"><meta name="description" content="FlowChat: connected customers, suppliers, stock and evidence-backed growth planning."><title>FlowChat · Your business, one step ahead</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
await copyFile('public/flowchat-sample-data.zip','dist/flowchat-sample-data.zip');
console.log('Built static demo from the same Next.js React component.');
