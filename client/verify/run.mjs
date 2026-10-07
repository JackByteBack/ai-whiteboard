/**
 * End-to-end verification of the wired /board/:id page against the real
 * dev servers (vite :5173 + API :5050) using headless Chrome over CDP.
 *
 * Flow: sign in (or sign up) → create a board → exercise the canvas
 * (create/edit/select/move/draw), realtime (second tab), undo/redo,
 * background, exports → screenshots + assertion summary.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import path from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const TMP = '/private/var/folders/pd/mq85wss95g5cc9qfypdh8htw0000gn/T/opencode'
const PROFILE = path.join(TMP, 'canvas-verify-profile')
const DOWNLOADS = path.join(TMP, 'canvas-verify-downloads')
const SHOTS = path.join(TMP, 'canvas-verify-shots')
const PORT = 9334
const BASE = 'http://localhost:5173'
const EMAIL = 'canvas.wiring.test@example.com'
const PASSWORD = 'Verify-Board-1234!'
const BOARD_TITLE = 'Wiring Test'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}
const fatal = async (msg, shot) => {
  console.error(`\nFATAL: ${msg}`)
  if (shot) await shot('fatal')
  throw new Error(msg)
}

/* ------------------------------------------------------------------ CDP -- */

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
    } else if (msg.method) {
      for (const listener of listeners) listener(msg)
    }
  }
  const ready = new Promise((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error('ws connect failed'))
  })
  const send = async (method, params = {}) => {
    await ready
    const i = ++id
    const result = new Promise((resolve, reject) => pending.set(i, { resolve, reject }))
    ws.send(JSON.stringify({ id: i, method, params }))
    return result
  }
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    })
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description || exceptionDetails.text)
    }
    return result.value
  }
  const waitFor = async (expression, timeout = 20000, label = expression) => {
    const started = Date.now()
    for (;;) {
      try {
        const value = await evaluate(expression)
        if (value) return value
      } catch {
        // page may be mid-navigation — keep polling
      }
      if (Date.now() - started > timeout) throw new Error(`timeout waiting for ${label}`)
      await sleep(250)
    }
  }
  const on = (method, handler) => listeners.add((msg) => msg.method === method && handler(msg.params))
  return { send, evaluate, waitFor, on, close: () => ws.close(), ready }
}

async function launchChrome() {
  spawnSync('/usr/bin/pkill', ['-f', PROFILE])
  mkdirSync(PROFILE, { recursive: true })
  rmSync(DOWNLOADS, { recursive: true, force: true })
  mkdirSync(DOWNLOADS, { recursive: true })
  mkdirSync(SHOTS, { recursive: true })

  const child = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) return child
    } catch {
      // not up yet
    }
    await sleep(250)
  }
  throw new Error('Chrome did not expose the debugging port')
}

const pageTargets = async () => (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()

/* ----------------------------------------------------------- page helpers */

const setInput = (c, selector, value) =>
  c.evaluate(`(() => {
    const el = ${selector}
    if (!el) return false
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)

const clickSelector = (c, jsExpr) =>
  c.evaluate(`(() => {
    const el = ${jsExpr}
    if (!el) return false
    el.click()
    return true
  })()`)

/** Real mouse input at an element's center — moves focus, unlike el.click(). */
const clickElement = async (c, jsExpr) => {
  const rect = await c.evaluate(`(() => {
    const el = ${jsExpr}
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  if (!rect) return false
  await clickAt(c, rect.x, rect.y)
  return true
}

const clickAt = async (c, x, y) => {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

const drag = async (c, x0, y0, x1, y1) => {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 })
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 })
  const steps = 8
  for (let i = 1; i <= steps; i += 1) {
    await c.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(x0 + ((x1 - x0) * i) / steps),
      y: Math.round(y0 + ((y1 - y0) * i) / steps),
      button: 'left',
    })
  }
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 })
}

const pressKey = async (c, key, { code, modifiers = 0, text } = {}) => {
  const params = {
    key,
    code: code || `Key${key.toUpperCase()}`,
    modifiers,
    windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
    ...(text ? { text } : {}),
  }
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params })
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
}

/* ------------------------------------------------------------------ main -- */

const chrome = await launchChrome()
let tab1
let tab2
let failures = 0

try {
  const targets = await pageTargets()
  tab1 = connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await tab1.ready

  const net = []
  const wsSent = []
  const wsRecv = []
  const consoleErrors = []

  tab1.on('Network.requestWillBeSent', (e) =>
    net.push({ id: e.requestId, url: e.request.url, method: e.request.method, status: 0 }),
  )
  tab1.on('Network.responseReceived', (e) => {
    const req = net.find((r) => r.id === e.requestId)
    if (req) {
      req.status = e.response.status
      req.mime = e.response.mimeType
    }
  })
  tab1.on('Network.webSocketFrameSent', (e) => wsSent.push(e.response.payloadData))
  tab1.on('Network.webSocketFrameReceived', (e) => wsRecv.push(e.response.payloadData))
  tab1.on('Runtime.exceptionThrown', (e) =>
    consoleErrors.push(e.exceptionDetails?.exception?.description || e.exceptionDetails?.text),
  )
  tab1.on('Runtime.consoleAPICalled', (e) => {
    if (e.type === 'error') {
      consoleErrors.push(e.args.map((a) => a.value ?? a.description ?? '').join(' '))
    }
  })

  await tab1.send('Page.enable')
  await tab1.send('Runtime.enable')
  await tab1.send('Network.enable')
  // downloads (exports) land in DOWNLOADS — prefer the browser-level API
  try {
    const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
    const browserCtl = connect(version.webSocketDebuggerUrl)
    await browserCtl.ready
    await browserCtl.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS })
    browserCtl.close()
  } catch {
    try {
      await tab1.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS })
    } catch {
      // best effort — export checks will report if files don't land
    }
  }

  const shot = async (name) => {
    const { data } = await tab1.send('Page.captureScreenshot', { format: 'png' })
    const file = path.join(SHOTS, `${name}.png`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    console.log(`  shot → ${file}`)
    return file
  }

  const bodyOf = async (req) => {
    try {
      return (await tab1.send('Network.getResponseBody', { requestId: req.id })).body
    } catch {
      return ''
    }
  }
  const findNet = async (pred, timeout = 10000) => {
    const started = Date.now()
    for (;;) {
      const hit = net.find(pred)
      if (hit) return hit
      if (Date.now() - started > timeout) return null
      await sleep(200)
    }
  }
  const pathOf = (req) => {
    try {
      return new URL(req.url).pathname
    } catch {
      return ''
    }
  }

  /* ---------------------------------------------------------- sign in -- */
  await tab1.send('Page.navigate', { url: `${BASE}/dashboard` })
  await tab1.waitFor(`document.readyState === 'complete'`, 20000, 'dashboard load')
  await sleep(2500) // allow session restore + redirect

  const landed = await tab1.evaluate('location.pathname')
  if (landed !== '/dashboard') {
    console.log(`  not signed in (at ${landed}) → auth flow`)
    await tab1.send('Page.navigate', { url: `${BASE}/auth/sign-in` })
    await tab1.waitFor(
      `document.readyState === 'complete' && (location.pathname === '/dashboard' || !!document.querySelector('input[type="password"]'))`,
      20000,
      'sign-in form',
    )

    if ((await tab1.evaluate('location.pathname')) !== '/dashboard') {
      await setInput(tab1, `document.querySelector('input[type="email"]') || document.querySelector('input[name="email"]')`, EMAIL)
      await setInput(tab1, `document.querySelector('input[type="password"]')`, PASSWORD)
      await clickSelector(
        tab1,
        `document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find((b) => /log ?in|sign in/i.test(b.textContent))`,
      )
      const signedIn = await tab1
        .waitFor(`location.pathname === '/dashboard'`, 10000, 'dashboard after sign-in')
        .then(() => true)
        .catch(() => false)

      if (!signedIn) {
        console.log('  sign-in failed → trying sign-up')
        await tab1.send('Page.navigate', { url: `${BASE}/auth/sign-up` })
        await tab1.waitFor(
          `document.readyState === 'complete' && !!document.querySelector('input[type="password"]')`,
          20000,
          'sign-up form',
        )
        await setInput(
          tab1,
          `document.querySelector('input[name="name"]') || document.querySelector('input[placeholder*="name" i]')`,
          'Canvas Test',
        )
        await setInput(tab1, `document.querySelector('input[type="email"]') || document.querySelector('input[name="email"]')`, EMAIL)
        await setInput(tab1, `document.querySelector('input[type="password"]')`, PASSWORD)
        await clickSelector(
          tab1,
          `document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find((b) => /sign up|create account/i.test(b.textContent))`,
        )
        await tab1
          .waitFor(`location.pathname === '/dashboard'`, 15000, 'dashboard after sign-up')
          .catch(() => null)
      }
    }
  }

  const authed = await tab1.evaluate(`location.pathname === '/dashboard'`)
  if (!authed) {
    const text = await tab1.evaluate(`document.body.innerText.slice(0, 600)`)
    await shot('auth-stuck')
    await fatal(`could not authenticate — page at ${await tab1.evaluate('location.pathname')}:\n${text}`, shot)
  }
  check('authenticate (session or sign-up)', true)

  /* ----------------------------------------------------- create a board -- */
  await tab1.waitFor(
    `Array.from(document.querySelectorAll('button')).some((b) => b.textContent.includes('New whiteboard'))`,
    15000,
    'New whiteboard button',
  )
  await clickSelector(
    tab1,
    `Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('New whiteboard'))`,
  )
  await tab1.waitFor(`!!document.querySelector('form#create-whiteboard input')`, 10000, 'create dialog')
  await setInput(tab1, `document.querySelector('form#create-whiteboard input')`, BOARD_TITLE)
  await clickSelector(
    tab1,
    `document.querySelector('button[form="create-whiteboard"]') || Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Create'))`,
  )
  await tab1.waitFor(`/\\/board\\//.test(location.pathname)`, 15000, 'board navigation')
  const boardId = await tab1.evaluate(`location.pathname.split('/board/')[1]`)
  check('create board → /board/:id', Boolean(boardId), boardId)

  /* --------------------------------------------------- board page basics -- */
  await tab1.waitFor(`!!document.querySelector('main svg')`, 15000, 'canvas svg')
  await tab1.waitFor(`!!document.querySelector('header')`, 10000, 'top bar')
  await tab1.waitFor(`document.querySelectorAll('button[aria-label]').length > 8`, 10000, 'toolbar')

  const boardGet = await findNet((r) => r.method === 'GET' && pathOf(r).endsWith(`/whiteboards/${boardId}`))
  check('GET /whiteboards/:id 200', boardGet?.status === 200, `status=${boardGet?.status}`)
  const boardBody = JSON.parse((await bodyOf(boardGet)) || '{}')
  check(
    'board payload {board,elements,members}',
    boardBody.board?.id === boardId && Array.isArray(boardBody.elements) && Array.isArray(boardBody.members),
    `role=${boardBody.board?.role} elements=${boardBody.elements?.length} members=${boardBody.members?.length}`,
  )
  check('role is owner (editable)', boardBody.board?.role === 'owner')
  check('initial elements empty', boardBody.elements?.length === 0)
  check(
    'title input shows board title',
    (await tab1.evaluate(`document.querySelector('header input')?.value`)) === BOARD_TITLE,
  )

  // socket join + presence sync (both happen right after page load)
  for (let i = 0; i < 40 && !wsSent.some((f) => f.includes('"wb:join"')); i += 1) await sleep(150)
  check('socket wb:join sent', wsSent.some((f) => f.includes('"wb:join"')))
  for (let i = 0; i < 40 && !wsRecv.some((f) => f.includes('presence:sync')); i += 1) await sleep(150)
  check('presence:sync received', wsRecv.some((f) => f.includes('presence:sync')))

  const center = await tab1.evaluate(`(() => {
    const r = document.querySelector('main svg').getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)

  /* ------------------------------------------------- create sticky + type -- */
  await pressKey(tab1, 's', { code: 'KeyS', text: 's' })
  await sleep(150)
  check(
    "shortcut 's' selects sticky tool",
    (await tab1.evaluate(`document.querySelector('button[aria-label="Sticky"]')?.getAttribute('aria-pressed')`)) === 'true',
  )

  await clickAt(tab1, center.x, center.y)
  await tab1.waitFor(`!!document.querySelector('main textarea')`, 5000, 'editing textarea')
  await sleep(250) // overlay focuses asynchronously
  await tab1.send('Input.insertText', { text: 'Hello wiring' })
  await sleep(400)
  const typed = await tab1.evaluate(`document.querySelector('main textarea')?.value`)
  check('typed into editor', typed === 'Hello wiring', JSON.stringify(typed))

  // Commit: a real click on the Select button blurs the editor (PATCH) and restores select.
  await clickElement(tab1, `document.querySelector('button[aria-label="Select"]')`)
  await tab1.waitFor(`!document.querySelector('main textarea')`, 5000, 'editor commit')
  await sleep(400)

  const stickyPost = await findNet(
    (r) => r.method === 'POST' && /\/elements$/.test(pathOf(r)) && r.status === 200,
  )
  check('POST /elements (sticky created)', Boolean(stickyPost), pathOf(stickyPost || { url: '' }))
  const stickyBody = JSON.parse((await bodyOf(stickyPost)) || '{}')
  const stickyId = stickyBody.element?.id
  check('sticky server id returned', Boolean(stickyId), stickyId)

  const stickyPatch = await findNet(
    (r) => r.method === 'PATCH' && pathOf(r).endsWith(`/elements/${stickyId}`),
  )
  const patchBody = stickyPatch ? JSON.parse((await bodyOf(stickyPatch)) || '{}') : {}
  check(
    'PATCH persisted typed text',
    patchBody.element?.data?.text === 'Hello wiring',
    `text=${JSON.stringify(patchBody.element?.data?.text)}`,
  )
  check(
    'sticky visible on canvas',
    (await tab1.evaluate(`document.querySelector('main svg').textContent`)).includes('Hello wiring'),
  )

  /* ---------------------------------------------------------- selection -- */
  await pressKey(tab1, 'v', { code: 'KeyV', text: 'v' })
  await sleep(150)
  await clickAt(tab1, center.x + 45, center.y + 40)
  await sleep(300)
  check('selection handles rendered', (await tab1.evaluate(`!!document.querySelector('main svg [data-overlay="1"]')`)))
  check('style panel shown on selection', (await tab1.evaluate(`!!document.querySelector('[class~="top-16"]')`)))
  check('undo enabled after edits', (await tab1.evaluate(`!document.querySelector('button[aria-label="Undo"]')?.disabled`)))

  /* ------------------------------------------------------- second tab -- */
  let newTarget
  try {
    newTarget = await (
      await fetch(
        `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`${BASE}/board/${boardId}`)}`,
        { method: 'PUT' },
      )
    ).json()
  } catch {
    newTarget = await (
      await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`${BASE}/board/${boardId}`)}`)
    ).json()
  }
  tab2 = connect(newTarget.webSocketDebuggerUrl)
  await tab2.ready
  const net2 = []
  const wsRecv2 = []
  const wsSent2 = []
  tab2.on('Network.requestWillBeSent', (e) => net2.push({ id: e.requestId, url: e.request.url, method: e.request.method }))
  tab2.on('Network.webSocketFrameSent', (e) => wsSent2.push(e.response.payloadData))
  tab2.on('Network.webSocketFrameReceived', (e) => wsRecv2.push(e.response.payloadData))
  await tab2.send('Page.enable')
  await tab2.send('Runtime.enable')
  await tab2.send('Network.enable')
  // don't poke tab 2's canvas until it has joined the board room
  for (let i = 0; i < 80 && !wsSent2.some((f) => f.includes('"wb:join"')); i += 1) await sleep(150)
  const tab2Joined = wsSent2.some((f) => f.includes('"wb:join"'))
  check('tab 2 joined board room', tab2Joined)

  // presence: the first tab should now show a collaborator avatar
  const viewerShown = await tab1
    .waitFor(`document.querySelectorAll('header .-space-x-2 > div').length >= 1`, 12000, 'presence avatar')
    .then(() => true)
    .catch(() => false)
  check('presence avatar appears on tab 1', viewerShown)

  // remote cursor: wiggle the pointer over tab 2's canvas
  const center2 = await tab2.waitFor(
    `(() => { const s = document.querySelector('main svg'); if (!s) return null; const r = s.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`,
    15000,
    'tab2 canvas',
  )
  for (let i = 0; i < 6; i += 1) {
    await tab2.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: center2.x + i * 12,
      y: center2.y + i * 8,
    })
    await sleep(80)
  }
  const cursorSeen = await (async () => {
    for (let i = 0; i < 40 && !wsRecv.some((f) => f.includes('"presence:cursor"')); i += 1) {
      await sleep(150)
    }
    return wsRecv.some((f) => f.includes('"presence:cursor"'))
  })()
  check('remote cursor frame reaches tab 1', cursorSeen)

  /* ------------------------------------------------------ move (live) -- */
  await drag(tab1, center.x + 45, center.y + 40, center.x + 115, center.y + 90)
  await sleep(600)
  const movePatch = await findNet(
    (r) =>
      r.method === 'PATCH' &&
      pathOf(r).endsWith(`/elements/${stickyId}`) &&
      net.indexOf(r) > net.indexOf(stickyPatch),
  )
  check('move persisted via PATCH', Boolean(movePatch))
  const liveSent = wsSent.some((f) => f.includes('"element:live"'))
  check('element:live streamed while dragging', liveSent)
  const liveSeenTab2 = await (async () => {
    for (let i = 0; i < 40 && !wsRecv2.some((f) => f.includes('"element:live"')); i += 1) await sleep(150)
    return wsRecv2.some((f) => f.includes('"element:live"'))
  })()
  check('tab 2 received element:live', liveSeenTab2)

  /* ------------------------------------------------------ draw a rect -- */
  await pressKey(tab1, 'r', { code: 'KeyR', text: 'r' })
  await sleep(150)
  await drag(tab1, center.x + 280, center.y + 240, center.x + 520, center.y + 380)
  const rectPost = await findNet(
    (r) => r.method === 'POST' && /\/elements$/.test(pathOf(r)) && r.status === 200 && r !== stickyPost,
  )
  const rectBody = rectPost ? JSON.parse((await bodyOf(rectPost)) || '{}') : {}
  const rectId = rectBody.element?.id
  check('rect created + persisted', Boolean(rectId), rectId)
  check('rect data shape ok', rectBody.element?.data?.w > 100 && rectBody.element?.data?.fill !== undefined)

  /* ------------------------------------------------------------- zoom -- */
  await clickSelector(tab1, `document.querySelector('button[aria-label="Zoom in"]')`)
  await sleep(200)
  const zoomLabel = await tab1.evaluate(
    `Array.from(document.querySelectorAll('button')).find((b) => b.title === 'Reset zoom')?.textContent`,
  )
  check('zoom in updates label', zoomLabel === '120%', `label=${zoomLabel}`)

  /* ------------------------------------------------------- background -- */
  await clickSelector(tab1, `document.querySelector('button[aria-label="Board background"]')`)
  await sleep(250)
  await clickSelector(
    tab1,
    `Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Grid')`,
  )
  await sleep(400)
  check('background pattern applied', (await tab1.evaluate(`!!document.querySelector('main .canvas-bg-grid')`)))
  const bgPatch = await findNet((r) => r.method === 'PATCH' && pathOf(r).endsWith(`/whiteboards/${boardId}`))
  check('board background PATCH sent', Boolean(bgPatch))

  /* --------------------------------------------------------- undo/redo -- */
  check(
    'history has entries',
    (await tab1.evaluate(`!document.querySelector('button[aria-label="Undo"]')?.disabled`)) === true,
  )
  await pressKey(tab1, 'z', { code: 'KeyZ', modifiers: 4 })
  await sleep(600)
  const undoDelete = await findNet((r) => r.method === 'DELETE' && pathOf(r).endsWith(`/elements/${rectId}`))
  check('undo removes rect (DELETE)', Boolean(undoDelete))
  check(
    'undo keeps sticky text',
    (await tab1.evaluate(`document.querySelector('main svg').textContent`)).includes('Hello wiring'),
  )

  await pressKey(tab1, 'z', { code: 'KeyZ', modifiers: 4 | 8 })
  await sleep(700)
  const redoPost = await findNet(
    (r) => r.method === 'POST' && /\/elements$/.test(pathOf(r)) && net.indexOf(r) > net.indexOf(undoDelete),
  )
  check('redo re-creates rect (POST)', Boolean(redoPost))

  /* ---------------------------------------------------------- exports -- */
  await clickSelector(
    tab1,
    `Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Export'))`,
  )
  await sleep(300)
  await clickSelector(
    tab1,
    `Array.from(document.querySelectorAll('[role="menuitem"]')).find((b) => b.textContent.includes('Download SVG'))`,
  )
  await sleep(900)
  const svgFile = path.join(DOWNLOADS, 'wiring-test.svg')
  let svgText = ''
  for (let i = 0; i < 20 && !existsSync(svgFile); i += 1) await sleep(250)
  if (existsSync(svgFile)) svgText = readFileSync(svgFile, 'utf8')
  check('export SVG downloads', existsSync(svgFile) && svgText.startsWith('<svg'), `${svgText.length} bytes`)
  check('SVG has no foreignObject', svgText.length > 0 && !svgText.includes('foreignObject'))
  check('SVG contains sticky text', svgText.includes('Hello wiring'))

  await clickSelector(
    tab1,
    `Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Export'))`,
  )
  await sleep(300)
  await clickSelector(
    tab1,
    `Array.from(document.querySelectorAll('[role="menuitem"]')).find((b) => b.textContent.includes('Download PNG'))`,
  )
  const pngFile = path.join(DOWNLOADS, 'wiring-test.png')
  for (let i = 0; i < 30 && !existsSync(pngFile); i += 1) await sleep(250)
  check('export PNG downloads', existsSync(pngFile), existsSync(pngFile) ? `${readFileSync(pngFile).length} bytes` : 'missing')

  /* ------------------------------------------------- canvas keyboard -- */
  await pressKey(tab1, 'e', { code: 'KeyE', text: 'e' })
  await sleep(120)
  check(
    "shortcut 'e' selects eraser",
    (await tab1.evaluate(`document.querySelector('button[aria-label="Eraser"]')?.getAttribute('aria-pressed')`)) === 'true',
  )
  await pressKey(tab1, 'v', { code: 'KeyV', text: 'v' })

  await shot('board-final')

  /* ----------------------------------------------------------- console -- */
  const realErrors = consoleErrors.filter(
    (e) =>
      e &&
      !/favicon|Failed to load resource.*(404|401)|script tag while rendering React/i.test(e),
  )
  check('zero console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))

  const serverErrors = net.filter((r) => r.status >= 400 && !/favicon/i.test(r.url))
  check(
    'no failed API requests',
    serverErrors.length === 0,
    serverErrors.slice(0, 3).map((r) => `${r.method} ${pathOf(r)} → ${r.status}`).join(' | '),
  )
} catch (error) {
  failures += 1
  console.error(error)
} finally {
  if (tab2) {
    try {
      await tab2.send('Page.captureScreenshot', { format: 'png' }).then(({ data }) =>
        writeFileSync(path.join(SHOTS, 'tab2.png'), Buffer.from(data, 'base64')),
      )
    } catch {
      // tab may already be gone
    }
    tab2.close()
  }
  if (tab1) tab1.close()
  try {
    spawnSync('/usr/bin/pkill', ['-f', PROFILE])
  } catch {
    // best effort
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    failures += failed.length
    console.log('Failed:')
    for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ''}`)
  }
  process.exit(failures ? 1 : 0)
}
