import './style.css'
import * as THREE from 'three'

document.querySelector('#app').innerHTML = `
  <div class="bg3d" id="bg3d"></div>
  <main class="layout">
    <section class="panel game-panel">
      <h1>Neon Tetris 3D</h1>
      <p class="subtitle">Vite + Three.js + arcade vibes ✨</p>
      <canvas id="game" width="300" height="600"></canvas>
      <div class="controls">
        <button id="startBtn">Mulai / Restart</button>
        <span>Keyboard: ← → gerak • ↑ rotasi • ↓ cepat • Space hard drop</span>
      </div>

      <div class="mobile-controls" id="mobileControls" aria-label="Mobile controls">
        <button class="m-btn" data-action="left">◀</button>
        <button class="m-btn" data-action="rotate">⟳</button>
        <button class="m-btn" data-action="right">▶</button>
        <button class="m-btn" data-action="down">▼</button>
        <button class="m-btn m-btn-wide" data-action="drop">HARD DROP</button>
        <button class="m-btn m-btn-wide" data-action="hold">HOLD</button>
      </div>
    </section>

    <aside class="panel info-panel">
      <div class="stat"><label>Score</label><strong id="score">0</strong></div>
      <div class="stat"><label>Lines</label><strong id="lines">0</strong></div>
      <div class="stat"><label>Level</label><strong id="level">1</strong></div>
      <div class="next-box">
        <h3>Next</h3>
        <canvas id="next" width="120" height="120"></canvas>
      </div>
      <div class="next-box">
        <h3>Hold (C)</h3>
        <canvas id="hold" width="120" height="120"></canvas>
      </div>
      <p class="tips">Tip: simpan piece penting pakai tombol <b>C</b> biar combo makin gila 🔥</p>
    </aside>
  </main>
`

// ---------- Three.js animated background ----------
const bgRoot = document.getElementById('bg3d')
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 100)
camera.position.z = 9

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
bgRoot.appendChild(renderer.domElement)

const starsGeo = new THREE.BufferGeometry()
const STAR_COUNT = 1200
const starPositions = new Float32Array(STAR_COUNT * 3)
for (let i = 0; i < STAR_COUNT * 3; i += 3) {
  starPositions[i] = (Math.random() - 0.5) * 25
  starPositions[i + 1] = (Math.random() - 0.5) * 25
  starPositions[i + 2] = (Math.random() - 0.5) * 25
}
starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))

const starsMat = new THREE.PointsMaterial({ color: 0x6efcff, size: 0.04, transparent: true, opacity: 0.8 })
const stars = new THREE.Points(starsGeo, starsMat)
scene.add(stars)

const ring = new THREE.Mesh(
  new THREE.TorusGeometry(4.8, 0.09, 16, 120),
  new THREE.MeshBasicMaterial({ color: 0x9f7bff, transparent: true, opacity: 0.35 })
)
ring.rotation.x = 0.9
scene.add(ring)

// ---------- Tetris core ----------
const canvas = document.getElementById('game')
const ctx = canvas.getContext('2d')
const nextCanvas = document.getElementById('next')
const nextCtx = nextCanvas.getContext('2d')
const holdCanvas = document.getElementById('hold')
const holdCtx = holdCanvas.getContext('2d')

const BLOCK = 30
const COLS = 10
const ROWS = 20

const COLORS = {
  I: '#41f5ff',
  J: '#4f6dff',
  L: '#ff9a3c',
  O: '#ffd84a',
  S: '#52ff8d',
  T: '#bb7bff',
  Z: '#ff5a7d'
}

const SHAPES = {
  I: [[1, 1, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  T: [[0, 1, 0], [1, 1, 1]],
  Z: [[1, 1, 0], [0, 1, 1]]
}

const scoreEl = document.getElementById('score')
const linesEl = document.getElementById('lines')
const levelEl = document.getElementById('level')

let board = []
let bag = []
let current = null
let next = null
let hold = null
let canHold = true

let score = 0
let lines = 0
let level = 1
let gameOver = false
let dropCounter = 0
let lastTime = 0

function resetBoard() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null))
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function refillBag() {
  bag.push(...shuffle(Object.keys(SHAPES)))
}

function createPiece(type) {
  return {
    type,
    shape: SHAPES[type].map((row) => [...row]),
    x: Math.floor(COLS / 2) - Math.ceil(SHAPES[type][0].length / 2),
    y: 0
  }
}

function takeFromBag() {
  if (bag.length === 0) refillBag()
  return bag.pop()
}

function collide(piece) {
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (!piece.shape[y][x]) continue
      const nx = piece.x + x
      const ny = piece.y + y
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true
      if (ny >= 0 && board[ny][nx]) return true
    }
  }
  return false
}

function mergePiece() {
  for (let y = 0; y < current.shape.length; y++) {
    for (let x = 0; x < current.shape[y].length; x++) {
      if (!current.shape[y][x]) continue
      const by = current.y + y
      if (by < 0) continue
      board[by][current.x + x] = current.type
    }
  }
}

function clearLines() {
  let cleared = 0
  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(Boolean)) {
      board.splice(y, 1)
      board.unshift(Array(COLS).fill(null))
      cleared++
      y++
    }
  }

  if (cleared > 0) {
    const scoreTable = [0, 100, 300, 500, 800]
    score += scoreTable[cleared] * level
    lines += cleared
    level = Math.floor(lines / 10) + 1
    updateHUD()
  }
}

function spawnNext() {
  current = next ?? createPiece(takeFromBag())
  next = createPiece(takeFromBag())
  current.x = Math.floor(COLS / 2) - Math.ceil(current.shape[0].length / 2)
  current.y = -1
  canHold = true

  if (collide(current)) {
    gameOver = true
  }
}

function rotateMatrix(m) {
  return m[0].map((_, i) => m.map((r) => r[i]).reverse())
}

function rotateCurrent() {
  const prev = current.shape
  current.shape = rotateMatrix(current.shape)

  const kicks = [0, -1, 1, -2, 2]
  for (const k of kicks) {
    current.x += k
    if (!collide(current)) return
    current.x -= k
  }
  current.shape = prev
}

function hardDrop() {
  while (!collide(current)) current.y++
  current.y--
  lockAndContinue()
}

function holdPiece() {
  if (!canHold) return
  canHold = false

  if (!hold) {
    hold = createPiece(current.type)
    spawnNext()
  } else {
    const swapType = hold.type
    hold = createPiece(current.type)
    current = createPiece(swapType)
  }
}

function lockAndContinue() {
  mergePiece()
  clearLines()
  spawnNext()
}

function drawCell(context, x, y, color, size = BLOCK) {
  context.fillStyle = color
  context.fillRect(x, y, size, size)

  const grad = context.createLinearGradient(x, y, x + size, y + size)
  grad.addColorStop(0, 'rgba(255,255,255,0.33)')
  grad.addColorStop(1, 'rgba(0,0,0,0.26)')
  context.fillStyle = grad
  context.fillRect(x, y, size, size)

  context.strokeStyle = 'rgba(255,255,255,0.25)'
  context.lineWidth = 2
  context.strokeRect(x + 1, y + 1, size - 2, size - 2)
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#0f1320'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath()
    ctx.moveTo(x * BLOCK, 0)
    ctx.lineTo(x * BLOCK, canvas.height)
    ctx.stroke()
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath()
    ctx.moveTo(0, y * BLOCK)
    ctx.lineTo(canvas.width, y * BLOCK)
    ctx.stroke()
  }

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!board[y][x]) continue
      drawCell(ctx, x * BLOCK, y * BLOCK, COLORS[board[y][x]])
    }
  }
}

function drawPiece(piece) {
  piece.shape.forEach((row, y) => {
    row.forEach((v, x) => {
      if (v) drawCell(ctx, (piece.x + x) * BLOCK, (piece.y + y) * BLOCK, COLORS[piece.type])
    })
  })
}

function drawMini(context, piece) {
  context.clearRect(0, 0, 120, 120)
  context.fillStyle = '#0f1320'
  context.fillRect(0, 0, 120, 120)
  if (!piece) return

  const shape = piece.shape
  const cell = Math.floor(90 / Math.max(shape.length, shape[0].length))
  const startX = (120 - shape[0].length * cell) / 2
  const startY = (120 - shape.length * cell) / 2

  shape.forEach((row, y) => {
    row.forEach((v, x) => {
      if (v) drawCell(context, startX + x * cell, startY + y * cell, COLORS[piece.type], cell)
    })
  })
}

function updateHUD() {
  scoreEl.textContent = score
  linesEl.textContent = lines
  levelEl.textContent = level
}

function gameLoop(time = 0) {
  const delta = time - lastTime
  lastTime = time
  if (!gameOver) {
    dropCounter += delta
    const dropMs = Math.max(110, 800 - (level - 1) * 65)
    if (dropCounter > dropMs) {
      current.y++
      if (collide(current)) {
        current.y--
        lockAndContinue()
      }
      dropCounter = 0
    }
  }

  drawBoard()
  if (!gameOver) drawPiece(current)
  drawMini(nextCtx, next)
  drawMini(holdCtx, hold)

  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.72)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.font = 'bold 34px Inter, sans-serif'
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 10)
    ctx.font = '16px Inter, sans-serif'
    ctx.fillText('Klik Mulai / Restart untuk main lagi', canvas.width / 2, canvas.height / 2 + 24)
  }

  stars.rotation.y += 0.0007
  stars.rotation.x += 0.0003
  ring.rotation.z += 0.0012
  renderer.render(scene, camera)

  requestAnimationFrame(gameLoop)
}

function resetGame() {
  resetBoard()
  bag = []
  refillBag()
  score = 0
  lines = 0
  level = 1
  gameOver = false
  hold = null
  canHold = true
  current = createPiece(takeFromBag())
  next = createPiece(takeFromBag())
  updateHUD()
  lastTime = performance.now()
  dropCounter = 0
}

function moveLeft() {
  if (gameOver) return
  current.x--
  if (collide(current)) current.x++
}

function moveRight() {
  if (gameOver) return
  current.x++
  if (collide(current)) current.x--
}

function softDrop() {
  if (gameOver) return
  current.y++
  if (collide(current)) {
    current.y--
    lockAndContinue()
  }
}

function rotatePiece() {
  if (gameOver) return
  rotateCurrent()
}

function hardDropPiece() {
  if (gameOver) return
  hardDrop()
}

function holdCurrentPiece() {
  if (gameOver) return
  holdPiece()
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') {
    moveLeft()
  } else if (e.key === 'ArrowRight') {
    moveRight()
  } else if (e.key === 'ArrowDown') {
    softDrop()
  } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'x') {
    rotatePiece()
  } else if (e.code === 'Space') {
    e.preventDefault()
    hardDropPiece()
  } else if (e.key.toLowerCase() === 'c') {
    holdCurrentPiece()
  }
})

document.getElementById('startBtn').addEventListener('click', resetGame)

const actionMap = {
  left: moveLeft,
  right: moveRight,
  down: softDrop,
  rotate: rotatePiece,
  drop: hardDropPiece,
  hold: holdCurrentPiece
}

document.querySelectorAll('.m-btn').forEach((btn) => {
  const act = btn.dataset.action
  const handler = actionMap[act]
  if (!handler) return

  const trigger = (e) => {
    e.preventDefault()
    handler()
  }

  btn.addEventListener('click', trigger)
  btn.addEventListener('touchstart', trigger, { passive: false })
})

let touchStartX = 0
let touchStartY = 0
let touchTime = 0
canvas.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0]
  touchStartX = t.clientX
  touchStartY = t.clientY
  touchTime = Date.now()
}, { passive: true })

canvas.addEventListener('touchend', (e) => {
  const t = e.changedTouches[0]
  const dx = t.clientX - touchStartX
  const dy = t.clientY - touchStartY
  const dt = Date.now() - touchTime
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)

  if (dt < 220 && adx < 12 && ady < 12) {
    rotatePiece()
    return
  }

  if (adx > ady && adx > 24) {
    if (dx > 0) moveRight()
    else moveLeft()
    return
  }

  if (ady > 24) {
    if (dy > 0) {
      if (dt < 180) hardDropPiece()
      else softDrop()
    } else {
      holdCurrentPiece()
    }
  }
}, { passive: true })

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

resetGame()
requestAnimationFrame(gameLoop)
