import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import path from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const TMP = '/private/var/folders/pd/mq85wss95g5cc9qfypdh8htw0000gn/T/opencode'
const PROFILE = path.join(TMP, 'canvas-verify-profile')
const PORT = 9334
const URL = process.argv[2] || 'http://localhost:5173/auth/sign-in'

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  const pending = new Map()
  const listeners = new Set()
  let id = 0
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    } else if (msg.method) for (const l of listeners) l(msg)
  }
  const ready = new Promise((res, rej) => {
    ws.onopen = () => res()
    ws.onerror = () => rej(new Error('ws failed'))
  })
  const send = async (method, params = {}) => {
    await ready
    const i = ++id
    const p = new Promise((resolve, reject) => pending.set(i, { resolve, reject }))
    ws.send(JSON.stringify({ id: i, method, params }))
    return p
  }
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true })
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text)
    return result.value
  }
  const on = (m, h) => listeners.add((msg) => msg.method === m && h(msg.params))
  return { send, evaluate, on, ready }
}

spawnSync('/usr/bin/pkill', ['-f', PROFILE])
mkdirSync(PROFILE, { recursive: true })
const child = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' })
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break } catch {}
  await sleep(250)
}

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const tab = connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await tab.ready
const logs = []
tab.on('Runtime.exceptionThrown', (e) => logs.push('EXC: ' + (e.exceptionDetails?.exception?.description || e.exceptionDetails?.text)))
tab.on('Runtime.consoleAPICalled', (e) => logs.push(`${e.type}: ` + e.args.map((a) => a.value ?? a.description ?? '').join(' ')))
await tab.send('Page.enable')
await tab.send('Runtime.enable')
await tab.send('Page.navigate', { url: URL })
for (let i = 0; i < 40; i++) {
  if (await tab.evaluate(`document.readyState === 'complete'`).catch(() => false)) break
  await sleep(250)
}
await sleep(4000)

const info = await tab.evaluate(`(() => ({
  path: location.pathname,
  title: document.title,
  inputs: Array.from(document.querySelectorAll('input')).map((i) => ({ type: i.type, name: i.name, placeholder: i.placeholder, id: i.id, autocomplete: i.autocomplete })),
  buttons: Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim().slice(0, 40)),
  links: Array.from(document.querySelectorAll('a')).map((a) => a.textContent.trim().slice(0, 40)),
  body: document.body.innerText.slice(0, 800),
}))()`)
console.log(JSON.stringify(info, null, 2))
console.log('--- console ---')
console.log(logs.slice(0, 20).join('\n'))
const { data } = await tab.send('Page.captureScreenshot', { format: 'png' })
writeFileSync(path.join(TMP, 'auth-debug.png'), Buffer.from(data, 'base64'))
console.log('shot →', path.join(TMP, 'auth-debug.png'))
tab.close()
child.kill()
process.exit(0)
