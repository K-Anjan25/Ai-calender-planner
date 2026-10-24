/** Compile JSX + CSS Modules into ONE self-contained HTML deliverable.
 * React and Lucide are bundled locally: no runtime CDN/transpiler dependency.
 * Google Fonts is optional; system/Georgia fallbacks work offline.
 */
import {build} from 'esbuild'
import {readFile, writeFile, mkdir} from 'node:fs/promises'
const result=await build({entryPoints:['standalone/calendra/App.jsx'],bundle:true,write:false,outdir:'out',minify:true,define:{'process.env.NODE_ENV':'"production"'},target:['es2020'],jsx:'automatic',legalComments:'none'})
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text.replaceAll('</script','<\\/script')
const css=result.outputFiles.find(f=>f.path.endsWith('.css')).text
const icon=await readFile('public/calendra-icon-v2.png')
const html=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#1c3028"><meta name="description" content="Give Calendra your tasks, deadlines and preferences. Build a realistic week and see what doesn’t fit."><meta property="og:type" content="website"><meta property="og:title" content="Calendra — The AI calendar planner"><meta property="og:description" content="A realistic week. An honest answer when it doesn’t fit."><meta name="twitter:card" content="summary"><meta name="color-scheme" content="light"><title>Calendra — The AI calendar planner</title><link rel="icon" type="image/png" href="data:image/png;base64,${icon.toString('base64')}"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet"><style>${css}</style></head><body><div id="root"></div><noscript><main style="padding:60px;font-family:system-ui"><h1>Calendra — The AI calendar planner</h1><p>Give it your tasks, deadlines and preferences. Build a realistic week — and see when it doesn’t fit.</p><p>Enable JavaScript to explore the interactive site.</p><a href="/planner">Open the planner</a></main></noscript><script>${js}</script></body></html>`
await mkdir('public',{recursive:true});await writeFile('public/calendra.html',html);console.log(`Built public/calendra.html (${Math.round(Buffer.byteLength(html)/1024)} KB); JSX, React, Lucide and CSS bundled inline.`)
