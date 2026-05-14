// ============================================================
// three-board.js — Monopoly Plus 3D Board Visualization
// Uses Three.js r128+ (loaded from CDN in index.html)
// ============================================================

// Global references
let scene3D, camera3D, renderer3D, controls3D;
let boardGroup, cityGroup, playerTokens = {}, houseModels = {}, ownerFlags = {};
let particleSystem, fireflies;
let diceGroup, dice3D = [];
let animationFrameId;
let raycaster3D, mouse3D;
let cellMeshes = [];
let highlightedCell = -1;
let isDayTime = true;
let turnCounter = 0;
let previousTurnIndex = -1;
let diceAnimating = false;

// Cell layout constants
const BOARD_SIZE = 20;
const CORNER_SIZE = 2.8;
const EDGE_SIZE = (BOARD_SIZE - 2 * CORNER_SIZE) / 9;
const CELL_HEIGHT = 0.15;

const COLOR_MAP = {
  '#8B4513': 0x8B4513, '#87CEEB': 0x87CEEB, '#FF69B4': 0xFF69B4,
  '#FFA500': 0xFFA500, '#FF0000': 0xFF0000, '#FFD700': 0xFFD700,
  '#228B22': 0x228B22, '#0000CD': 0x0000CD, '#333': 0x333333, '#999': 0x999999
};

const COLOR_GROUP_MAP = {
  '#8B4513': 'brown', '#87CEEB': 'lightblue', '#FF69B4': 'pink',
  '#FFA500': 'orange', '#FF0000': 'red', '#FFD700': 'yellow',
  '#228B22': 'green', '#0000CD': 'blue'
};

const COLOR_GROUPS_3D = {
  brown: [1, 3], lightblue: [6, 8, 9], pink: [11, 13, 14],
  orange: [16, 18, 19], red: [21, 23, 24], yellow: [26, 27, 29],
  green: [31, 32, 34], blue: [37, 39]
};

// Token shapes (simple primitives)
const TOKEN_TYPES = ['car', 'hat', 'dog', 'ship', 'iron', 'thimble'];

// ============================================================
// TEXTURE GENERATION
// ============================================================
function createMarbleTexture(baseColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor || '#e8e0d0';
  ctx.fillRect(0, 0, 256, 256);
  // Marble veins
  ctx.strokeStyle = 'rgba(180,170,155,0.3)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 20; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * 256, Math.random() * 256);
    ctx.bezierCurveTo(
      Math.random() * 256, Math.random() * 256,
      Math.random() * 256, Math.random() * 256,
      Math.random() * 256, Math.random() * 256
    );
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createCellTexture(name, price, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f5f0e8';
  ctx.fillRect(0, 0, 128, 128);

  if (color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 20);
  }

  ctx.fillStyle = '#333';
  ctx.font = 'bold 11px Georgia';
  ctx.textAlign = 'center';

  // Word wrap
  const words = name.split(' ');
  let line = '';
  let y = color ? 42 : 30;
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > 110 && line) {
      ctx.fillText(line.trim(), 64, y);
      line = word + ' ';
      y += 14;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), 64, y);

  if (price > 0) {
    ctx.font = '10px Georgia';
    ctx.fillStyle = '#666';
    ctx.fillText(price + '$', 64, 110);
  }

  // Gold border
  ctx.strokeStyle = '#c8a84e';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 126, 126);

  return new THREE.CanvasTexture(canvas);
}

function createDiceTexture(num) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#c8a84e';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 62, 62);

  ctx.fillStyle = '#1a1a2e';
  const r = 5;
  const positions = {
    1: [[32, 32]],
    2: [[18, 18], [46, 46]],
    3: [[18, 18], [32, 32], [46, 46]],
    4: [[18, 18], [46, 18], [18, 46], [46, 46]],
    5: [[18, 18], [46, 18], [32, 32], [18, 46], [46, 46]],
    6: [[18, 14], [46, 14], [18, 32], [46, 32], [18, 50], [46, 50]],
  };
  (positions[num] || []).forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  });

  return new THREE.CanvasTexture(canvas);
}

// ============================================================
// 3D CELL POSITIONS
// ============================================================
function getCellPosition3D(index) {
  const half = BOARD_SIZE / 2;
  let x, z, rotation = 0;

  if (index === 0) { x = half - CORNER_SIZE / 2; z = half - CORNER_SIZE / 2; }
  else if (index < 10) {
    x = half - CORNER_SIZE - EDGE_SIZE * (index - 0.5);
    z = half - CORNER_SIZE / 2;
    rotation = 0;
  }
  else if (index === 10) { x = -half + CORNER_SIZE / 2; z = half - CORNER_SIZE / 2; }
  else if (index < 20) {
    x = -half + CORNER_SIZE / 2;
    z = half - CORNER_SIZE - EDGE_SIZE * (index - 10 - 0.5);
    rotation = Math.PI / 2;
  }
  else if (index === 20) { x = -half + CORNER_SIZE / 2; z = -half + CORNER_SIZE / 2; }
  else if (index < 30) {
    x = -half + CORNER_SIZE + EDGE_SIZE * (index - 21 + 0.5);
    z = -half + CORNER_SIZE / 2;
    rotation = Math.PI;
  }
  else if (index === 30) { x = half - CORNER_SIZE / 2; z = -half + CORNER_SIZE / 2; }
  else if (index < 40) {
    x = half - CORNER_SIZE / 2;
    z = -half + CORNER_SIZE + EDGE_SIZE * (index - 31 + 0.5);
    rotation = -Math.PI / 2;
  }
  else { x = 0; z = 0; }

  return { x, z, rotation };
}

function getCellSize3D(index) {
  if (index === 0 || index === 10 || index === 20 || index === 30) {
    return { w: CORNER_SIZE, h: CORNER_SIZE };
  }
  if (index >= 1 && index <= 9) return { w: EDGE_SIZE, h: CORNER_SIZE };
  if (index >= 11 && index <= 19) return { w: CORNER_SIZE, h: EDGE_SIZE };
  if (index >= 21 && index <= 29) return { w: EDGE_SIZE, h: CORNER_SIZE };
  if (index >= 31 && index <= 39) return { w: CORNER_SIZE, h: EDGE_SIZE };
  return { w: EDGE_SIZE, h: CORNER_SIZE };
}

// ============================================================
// INIT 3D SCENE
// ============================================================
function initBoard3D(container) {
  if (scene3D) return; // already initialized

  scene3D = new THREE.Scene();
  scene3D.background = new THREE.Color(0x0a0a1a);
  scene3D.fog = new THREE.FogExp2(0x0a0a1a, 0.008);

  // Camera
  const aspect = container.clientWidth / container.clientHeight;
  camera3D = new THREE.PerspectiveCamera(45, aspect, 0.1, 200);
  camera3D.position.set(18, 22, 18);
  camera3D.lookAt(0, 0, 0);

  // Renderer
  renderer3D = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer3D.setSize(container.clientWidth, container.clientHeight);
  renderer3D.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer3D.shadowMap.enabled = true;
  renderer3D.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer3D.toneMapping = THREE.ACESFilmicToneMapping;
  renderer3D.toneMappingExposure = 1.2;
  container.appendChild(renderer3D.domElement);

  // Controls
  controls3D = new THREE.OrbitControls(camera3D, renderer3D.domElement);
  controls3D.enableDamping = true;
  controls3D.dampingFactor = 0.05;
  controls3D.maxPolarAngle = Math.PI / 2.2;
  controls3D.minDistance = 10;
  controls3D.maxDistance = 40;
  controls3D.target.set(0, 0, 0);

  // Lighting
  setupLighting();

  // Board
  buildBoard();

  // City
  buildCity();

  // Dice
  buildDice();

  // Particles (fireflies)
  buildFireflies();

  // Raycaster for hover tooltips
  raycaster3D = new THREE.Raycaster();
  mouse3D = new THREE.Vector2();

  // Events
  container.addEventListener('mousemove', onBoardMouseMove);
  container.addEventListener('click', onBoardClick);
  container.addEventListener('touchstart', onBoardTouch, { passive: true });

  window.addEventListener('resize', () => {
    if (!renderer3D || !container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera3D.aspect = w / h;
    camera3D.updateProjectionMatrix();
    renderer3D.setSize(w, h);
  });

  // Start render loop
  animate3D();
}

function setupLighting() {
  // Ambient
  const ambient = new THREE.AmbientLight(0x404060, 0.6);
  ambient.name = 'ambient';
  scene3D.add(ambient);

  // Main directional (sun/moon)
  const directional = new THREE.DirectionalLight(0xfff5e0, 1.2);
  directional.position.set(15, 25, 10);
  directional.castShadow = true;
  directional.shadow.mapSize.width = 1024;
  directional.shadow.mapSize.height = 1024;
  directional.shadow.camera.near = 1;
  directional.shadow.camera.far = 60;
  directional.shadow.camera.left = -20;
  directional.shadow.camera.right = 20;
  directional.shadow.camera.top = 20;
  directional.shadow.camera.bottom = -20;
  directional.name = 'sun';
  scene3D.add(directional);

  // Warm fill
  const fill = new THREE.PointLight(0xffa040, 0.4, 50);
  fill.position.set(-8, 10, -8);
  fill.name = 'fill';
  scene3D.add(fill);

  // Gold rim light
  const rim = new THREE.PointLight(0xd4af37, 0.3, 40);
  rim.position.set(10, 8, -10);
  rim.name = 'rim';
  scene3D.add(rim);
}

// ============================================================
// BUILD BOARD
// ============================================================
function buildBoard() {
  boardGroup = new THREE.Group();
  boardGroup.name = 'board';

  // Base platform
  const baseGeo = new THREE.BoxGeometry(BOARD_SIZE + 1, 0.3, BOARD_SIZE + 1);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x1a3322,
    roughness: 0.4,
    metalness: 0.2,
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = -0.15;
  base.receiveShadow = true;
  boardGroup.add(base);

  // Gold border frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.2 });
  const frameThickness = 0.15;
  const frameHeight = 0.25;
  const outerSize = BOARD_SIZE + 0.6;

  [[outerSize, frameHeight, frameThickness, 0, frameHeight / 2, outerSize / 2],
   [outerSize, frameHeight, frameThickness, 0, frameHeight / 2, -outerSize / 2],
   [frameThickness, frameHeight, outerSize, outerSize / 2, frameHeight / 2, 0],
   [frameThickness, frameHeight, outerSize, -outerSize / 2, frameHeight / 2, 0],
  ].forEach(([w, h, d, x, y, z]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(g, frameMat);
    m.position.set(x, y, z);
    m.castShadow = true;
    boardGroup.add(m);
  });

  // Build each cell
  cellMeshes = [];
  for (let i = 0; i < 40; i++) {
    const cellData = typeof BOARD_DATA !== 'undefined' ? BOARD_DATA[i] : null;
    const pos = getCellPosition3D(i);
    const size = getCellSize3D(i);

    const cellGeo = new THREE.BoxGeometry(size.w - 0.05, CELL_HEIGHT, size.h - 0.05);
    const cellTexture = cellData ? createCellTexture(cellData.name, cellData.price, cellData.color) : null;

    const cellMat = new THREE.MeshStandardMaterial({
      map: cellTexture,
      color: 0xf5f0e8,
      roughness: 0.5,
      metalness: 0.05,
    });

    const cellMesh = new THREE.Mesh(cellGeo, cellMat);
    cellMesh.position.set(pos.x, CELL_HEIGHT / 2, pos.z);
    cellMesh.receiveShadow = true;
    cellMesh.userData = { cellIndex: i };
    cellMesh.name = `cell_${i}`;

    boardGroup.add(cellMesh);
    cellMeshes.push(cellMesh);

    // Color strip on top edge
    if (cellData && cellData.color && COLOR_MAP[cellData.color] !== undefined) {
      const stripGeo = new THREE.BoxGeometry(size.w - 0.1, 0.06, 0.3);
      const stripMat = new THREE.MeshStandardMaterial({
        color: COLOR_MAP[cellData.color],
        roughness: 0.3,
        metalness: 0.4,
        emissive: COLOR_MAP[cellData.color],
        emissiveIntensity: 0.15,
      });
      const strip = new THREE.Mesh(stripGeo, stripMat);

      // Position strip on the "outer" edge of the cell
      if (i >= 1 && i <= 9) strip.position.set(pos.x, CELL_HEIGHT + 0.03, pos.z + size.h / 2 - 0.2);
      else if (i >= 11 && i <= 19) { strip.rotation.y = Math.PI / 2; strip.position.set(pos.x - size.w / 2 + 0.2, CELL_HEIGHT + 0.03, pos.z); }
      else if (i >= 21 && i <= 29) strip.position.set(pos.x, CELL_HEIGHT + 0.03, pos.z - size.h / 2 + 0.2);
      else if (i >= 31 && i <= 39) { strip.rotation.y = Math.PI / 2; strip.position.set(pos.x + size.w / 2 - 0.2, CELL_HEIGHT + 0.03, pos.z); }

      boardGroup.add(strip);
    }
  }

  // Center text
  const centerCanvas = document.createElement('canvas');
  centerCanvas.width = 512; centerCanvas.height = 512;
  const centerCtx = centerCanvas.getContext('2d');
  centerCtx.fillStyle = '#1a3322';
  centerCtx.fillRect(0, 0, 512, 512);
  centerCtx.fillStyle = '#d4af37';
  centerCtx.font = 'bold 48px Georgia';
  centerCtx.textAlign = 'center';
  centerCtx.fillText('\u041C\u041E\u041D\u041E\u041F\u041E\u041B\u0418\u0418', 256, 240);
  centerCtx.font = '24px Georgia';
  centerCtx.fillText('3D EDITION', 256, 290);

  const centerTexture = new THREE.CanvasTexture(centerCanvas);
  const centerGeo = new THREE.PlaneGeometry(BOARD_SIZE - 2 * CORNER_SIZE - 0.5, BOARD_SIZE - 2 * CORNER_SIZE - 0.5);
  const centerMat = new THREE.MeshStandardMaterial({ map: centerTexture, roughness: 0.6 });
  const centerPlane = new THREE.Mesh(centerGeo, centerMat);
  centerPlane.rotation.x = -Math.PI / 2;
  centerPlane.position.y = 0.01;
  boardGroup.add(centerPlane);

  scene3D.add(boardGroup);
}

// ============================================================
// BUILD CITY (center)
// ============================================================
function buildCity() {
  cityGroup = new THREE.Group();
  cityGroup.name = 'city';
  cityGroup.position.y = 0.16;

  const colorGroups = ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'blue'];
  const groupColors = {
    brown: 0x8B4513, lightblue: 0x87CEEB, pink: 0xFF69B4, orange: 0xFFA500,
    red: 0xFF0000, yellow: 0xFFD700, green: 0x228B22, blue: 0x0000CD
  };

  // Position zones in a circle inside the board
  const innerRadius = 4.5;
  colorGroups.forEach((group, i) => {
    const angle = (i / colorGroups.length) * Math.PI * 2 - Math.PI / 4;
    const x = Math.cos(angle) * innerRadius;
    const z = Math.sin(angle) * innerRadius;

    const zoneGroup = new THREE.Group();
    zoneGroup.position.set(x, 0, z);
    zoneGroup.name = `zone_${group}`;

    // Basic buildings for each zone
    const buildingCount = 3 + Math.floor(Math.random() * 2);
    for (let b = 0; b < buildingCount; b++) {
      const bx = (Math.random() - 0.5) * 2;
      const bz = (Math.random() - 0.5) * 2;
      const height = 0.3 + Math.random() * 0.8;
      const width = 0.3 + Math.random() * 0.3;

      const buildingGeo = new THREE.BoxGeometry(width, height, width);
      const buildingMat = new THREE.MeshStandardMaterial({
        color: groupColors[group],
        roughness: 0.6,
        metalness: 0.1,
      });
      const building = new THREE.Mesh(buildingGeo, buildingMat);
      building.position.set(bx, height / 2, bz);
      building.castShadow = true;
      building.name = `building_${group}_${b}`;
      zoneGroup.add(building);

      // Roof
      const roofGeo = new THREE.ConeGeometry(width * 0.6, 0.2, 4);
      const roofMat = new THREE.MeshStandardMaterial({
        color: 0x8B0000,
        roughness: 0.7,
      });
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(bx, height + 0.1, bz);
      roof.rotation.y = Math.PI / 4;
      zoneGroup.add(roof);

      // Windows (emissive at night)
      if (height > 0.5) {
        const winGeo = new THREE.PlaneGeometry(0.08, 0.06);
        const winMat = new THREE.MeshStandardMaterial({
          color: 0xffee88,
          emissive: 0xffee88,
          emissiveIntensity: 0,
        });
        winMat.name = 'window';
        for (let wy = 0; wy < Math.min(3, Math.floor(height / 0.2)); wy++) {
          for (let side = 0; side < 2; side++) {
            const win = new THREE.Mesh(winGeo, winMat.clone());
            const wx = bx + (side === 0 ? -width / 2 - 0.001 : width / 2 + 0.001);
            win.position.set(wx, 0.15 + wy * 0.2, bz);
            if (side === 1) win.rotation.y = Math.PI;
            else win.rotation.y = 0;
            win.rotation.y = side === 0 ? -Math.PI / 2 : Math.PI / 2;
            win.name = 'cityWindow';
            zoneGroup.add(win);
          }
        }
      }
    }

    // Small road circle around zone
    const roadGeo = new THREE.RingGeometry(1.2, 1.4, 16);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, side: THREE.DoubleSide });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    zoneGroup.add(road);

    cityGroup.add(zoneGroup);
  });

  // Small "car" objects moving
  for (let c = 0; c < 4; c++) {
    const carGeo = new THREE.BoxGeometry(0.2, 0.1, 0.12);
    const carMat = new THREE.MeshStandardMaterial({
      color: [0xff4444, 0x44aaff, 0xffdd44, 0x44ff44][c],
      roughness: 0.3,
      metalness: 0.5
    });
    const car = new THREE.Mesh(carGeo, carMat);
    car.position.set(0, 0.22, 0);
    car.name = `cityCar_${c}`;
    car.userData = { angle: c * Math.PI / 2, radius: 2 + c * 0.8, speed: 0.3 + Math.random() * 0.3 };
    cityGroup.add(car);
  }

  scene3D.add(cityGroup);
}

// ============================================================
// BUILD DICE
// ============================================================
function buildDice() {
  diceGroup = new THREE.Group();
  diceGroup.name = 'dice';
  diceGroup.position.set(0, 3, 0);

  for (let d = 0; d < 2; d++) {
    const diceGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const diceMaterials = [];
    // Order: +X, -X, +Y, -Y, +Z, -Z → faces 2,5,1,6,3,4 (standard die)
    const faceValues = [2, 5, 1, 6, 3, 4];
    faceValues.forEach(val => {
      diceMaterials.push(new THREE.MeshStandardMaterial({
        map: createDiceTexture(val),
        roughness: 0.3,
        metalness: 0.1,
      }));
    });

    const diceMesh = new THREE.Mesh(diceGeo, diceMaterials);
    diceMesh.position.set(d * 1.2 - 0.6, 0, 0);
    diceMesh.castShadow = true;
    diceMesh.name = `die_${d}`;
    diceMesh.userData = { faceValues };
    diceGroup.add(diceMesh);
    dice3D.push(diceMesh);
  }

  diceGroup.visible = false;
  scene3D.add(diceGroup);
}

// ============================================================
// FIREFLIES (atmosphere)
// ============================================================
function buildFireflies() {
  const count = 60;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 24;
    positions[i * 3 + 1] = 1 + Math.random() * 6;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 24;

    const gold = Math.random() > 0.5;
    colors[i * 3] = gold ? 1 : 0.8;
    colors[i * 3 + 1] = gold ? 0.85 : 0.9;
    colors[i * 3 + 2] = gold ? 0.3 : 1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  fireflies = new THREE.Points(geo, mat);
  fireflies.name = 'fireflies';
  scene3D.add(fireflies);
}

// ============================================================
// CREATE HOUSE/HOTEL 3D MODELS
// ============================================================
function createHouseModel() {
  const group = new THREE.Group();

  // Base
  const baseGeo = new THREE.BoxGeometry(0.3, 0.25, 0.3);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.6 });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.125;
  base.castShadow = true;
  group.add(base);

  // Roof (red pyramid)
  const roofGeo = new THREE.ConeGeometry(0.22, 0.18, 4);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.5 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 0.34;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  // Door
  const doorGeo = new THREE.PlaneGeometry(0.06, 0.1);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, side: THREE.DoubleSide });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 0.05, 0.151);
  group.add(door);

  // Window
  const winGeo = new THREE.PlaneGeometry(0.06, 0.05);
  const winMat = new THREE.MeshStandardMaterial({ color: 0x87CEEB, emissive: 0x87CEEB, emissiveIntensity: 0.2, side: THREE.DoubleSide });
  const win = new THREE.Mesh(winGeo, winMat);
  win.position.set(0, 0.18, 0.151);
  group.add(win);

  return group;
}

function createHotelModel() {
  const group = new THREE.Group();

  // Tall building
  const baseGeo = new THREE.BoxGeometry(0.4, 0.6, 0.35);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.4, metalness: 0.2 });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.3;
  base.castShadow = true;
  group.add(base);

  // Tower
  const towerGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.2, 8);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.7, roughness: 0.2 });
  const tower = new THREE.Mesh(towerGeo, towerMat);
  tower.position.y = 0.7;
  tower.castShadow = true;
  group.add(tower);

  // Flag
  const flagPoleGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.15, 4);
  const flagPoleMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const pole = new THREE.Mesh(flagPoleGeo, flagPoleMat);
  pole.position.y = 0.875;
  group.add(pole);

  const flagGeo = new THREE.PlaneGeometry(0.1, 0.06);
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xff4444, side: THREE.DoubleSide });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0.05, 0.92, 0);
  group.add(flag);

  // Windows
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const wg = new THREE.PlaneGeometry(0.06, 0.05);
      const wm = new THREE.MeshStandardMaterial({ color: 0xffee88, emissive: 0xffee88, emissiveIntensity: 0.2, side: THREE.DoubleSide });
      const w = new THREE.Mesh(wg, wm);
      w.position.set(-0.08 + col * 0.16, 0.12 + row * 0.16, 0.176);
      group.add(w);
    }
  }

  return group;
}

// ============================================================
// CREATE PLAYER TOKEN
// ============================================================
function createTokenModel(type, color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.3, metalness: 0.6 });

  switch (type) {
    case 'car': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.25), mat);
      body.position.y = 0.15;
      group.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.22), mat);
      cab.position.set(-0.05, 0.27, 0);
      group.add(cab);
      // Wheels
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
      for (let wx of [-0.15, 0.15]) {
        for (let wz of [-0.14, 0.14]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8), wheelMat);
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(wx, 0.05, wz);
          group.add(wheel);
        }
      }
      break;
    }
    case 'hat': {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 16), mat);
      brim.position.y = 0.08;
      group.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.25, 16), mat);
      crown.position.y = 0.22;
      group.add(crown);
      break;
    }
    case 'dog': {
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.15), mat);
      torso.position.y = 0.2;
      group.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), mat);
      head.position.set(0.2, 0.3, 0);
      group.add(head);
      for (let lx of [-0.1, 0.1]) {
        for (let lz of [-0.06, 0.06]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 4), mat);
          leg.position.set(lx, 0.06, lz);
          group.add(leg);
        }
      }
      break;
    }
    case 'ship': {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.2), mat);
      hull.position.y = 0.1;
      group.add(hull);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 4), mat);
      mast.position.y = 0.325;
      group.add(mast);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.2), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      sail.position.set(0.08, 0.35, 0);
      group.add(sail);
      break;
    }
    case 'iron': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.15), mat);
      base.position.y = 0.04;
      group.add(base);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.12), mat);
      top.position.set(-0.05, 0.15, 0);
      group.add(top);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 4, 8, Math.PI), mat);
      handle.position.set(-0.05, 0.26, 0);
      group.add(handle);
      break;
    }
    default: { // thimble
      const thimble = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.25, 12), mat);
      thimble.position.y = 0.125;
      group.add(thimble);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), mat);
      top.position.y = 0.25;
      group.add(top);
      break;
    }
  }

  group.castShadow = true;
  return group;
}

// Create jail bars
function createJailBars() {
  const group = new THREE.Group();
  const barMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.3 });

  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4), barMat);
    bar.position.set(-0.12 + i * 0.08, 0.3, 0);
    group.add(bar);
  }
  // Top bar
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.02), barMat);
  topBar.position.y = 0.6;
  group.add(topBar);

  return group;
}

// ============================================================
// OWNER FLAG
// ============================================================
function createOwnerFlag(color) {
  const group = new THREE.Group();

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4), poleMat);
  pole.position.y = 0.2;
  group.add(pole);

  const flagMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, emissive: new THREE.Color(color), emissiveIntensity: 0.3 });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.1), flagMat);
  flag.position.set(0.08, 0.38, 0);
  group.add(flag);

  return group;
}

// ============================================================
// MONEY PARTICLE EFFECT
// ============================================================
function spawnMoneyParticles(fromPos, toPos) {
  const count = 15;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = fromPos.x + (Math.random() - 0.5) * 0.5;
    positions[i * 3 + 1] = fromPos.y + 0.5 + Math.random() * 0.5;
    positions[i * 3 + 2] = fromPos.z + (Math.random() - 0.5) * 0.5;

    velocities.push({
      x: (toPos.x - fromPos.x) * 0.02 + (Math.random() - 0.5) * 0.03,
      y: 0.05 + Math.random() * 0.03,
      z: (toPos.z - fromPos.z) * 0.02 + (Math.random() - 0.5) * 0.03,
    });
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0xd4af37,
    size: 0.12,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const particles = new THREE.Points(geo, mat);
  particles.name = 'moneyParticles';
  particles.userData = { velocities, life: 0, maxLife: 60 };
  scene3D.add(particles);
}

// ============================================================
// ANIMATE 3D
// ============================================================
let clock = new THREE.Clock();

function animate3D() {
  animationFrameId = requestAnimationFrame(animate3D);

  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // Controls update
  if (controls3D) controls3D.update();

  // Animate fireflies
  if (fireflies) {
    const pos = fireflies.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3] += Math.sin(elapsed * 0.5 + i) * 0.003;
      pos.array[i * 3 + 1] += Math.cos(elapsed * 0.3 + i * 2) * 0.002;
      pos.array[i * 3 + 2] += Math.sin(elapsed * 0.4 + i * 3) * 0.003;
    }
    pos.needsUpdate = true;
    fireflies.material.opacity = 0.3 + Math.sin(elapsed) * 0.3;
  }

  // Animate city cars
  if (cityGroup) {
    cityGroup.children.forEach(child => {
      if (child.name && child.name.startsWith('cityCar_')) {
        const d = child.userData;
        d.angle += d.speed * delta;
        child.position.x = Math.cos(d.angle) * d.radius;
        child.position.z = Math.sin(d.angle) * d.radius;
        child.rotation.y = -d.angle + Math.PI / 2;
      }
    });
  }

  // Animate city windows (flicker)
  if (cityGroup && !isDayTime) {
    cityGroup.traverse(obj => {
      if (obj.name === 'cityWindow' && obj.material) {
        if (Math.random() < 0.005) {
          obj.material.emissiveIntensity = obj.material.emissiveIntensity > 0.1 ? 0 : 0.4 + Math.random() * 0.3;
        }
      }
    });
  }

  // Animate money particles
  scene3D.children.forEach(child => {
    if (child.name === 'moneyParticles') {
      child.userData.life++;
      if (child.userData.life >= child.userData.maxLife) {
        scene3D.remove(child);
        child.geometry.dispose();
        child.material.dispose();
        return;
      }
      const pos = child.geometry.attributes.position;
      const vels = child.userData.velocities;
      for (let i = 0; i < pos.count; i++) {
        pos.array[i * 3] += vels[i].x;
        pos.array[i * 3 + 1] += vels[i].y;
        pos.array[i * 3 + 2] += vels[i].z;
        vels[i].y -= 0.001; // gravity
      }
      pos.needsUpdate = true;
      child.material.opacity = 1 - (child.userData.life / child.userData.maxLife);
    }
  });

  // Animate player tokens (gentle bob)
  Object.values(playerTokens).forEach(token => {
    if (token.visible && !token.userData.animating) {
      token.position.y = token.userData.baseY + Math.sin(elapsed * 2 + token.userData.phase) * 0.02;
    }
  });

  // Dice animation
  if (diceAnimating && diceGroup.visible) {
    dice3D.forEach((die, i) => {
      if (die.userData.animPhase === 'rolling') {
        die.userData.animTime += delta;
        die.rotation.x += die.userData.rotSpeed.x * delta;
        die.rotation.z += die.userData.rotSpeed.z * delta;
        die.position.y = Math.abs(Math.sin(die.userData.animTime * 8)) * 1.5 + 0.3;

        if (die.userData.animTime > 1.5) {
          die.userData.animPhase = 'settling';
        }
      } else if (die.userData.animPhase === 'settling') {
        die.userData.animTime += delta;
        die.position.y *= 0.9;
        die.rotation.x += die.userData.rotSpeed.x * delta * 0.5;
        die.rotation.z += die.userData.rotSpeed.z * delta * 0.5;
        die.userData.rotSpeed.x *= 0.95;
        die.userData.rotSpeed.z *= 0.95;

        if (die.userData.animTime > 2.5) {
          die.userData.animPhase = 'done';
          // Snap to target rotation
          die.rotation.set(die.userData.targetRot.x, die.userData.targetRot.y, die.userData.targetRot.z);
          die.position.y = 0.3;
        }
      }
    });

    if (dice3D.every(d => d.userData.animPhase === 'done')) {
      diceAnimating = false;
      setTimeout(() => { diceGroup.visible = false; }, 2000);
    }
  }

  // Render
  if (renderer3D) renderer3D.render(scene3D, camera3D);
}

// ============================================================
// DICE ROLL ANIMATION
// ============================================================
function getDiceRotationForValue(value) {
  // Map value to rotation that shows correct face on top
  // Face order: +X=2, -X=5, +Y=1, -Y=6, +Z=3, -Z=4
  const rotations = {
    1: { x: 0, y: 0, z: 0 },           // +Y is up = 1
    2: { x: 0, y: 0, z: Math.PI / 2 },  // +X up = 2
    3: { x: -Math.PI / 2, y: 0, z: 0 }, // +Z up = 3
    4: { x: Math.PI / 2, y: 0, z: 0 },  // -Z up = 4
    5: { x: 0, y: 0, z: -Math.PI / 2 }, // -X up = 5
    6: { x: Math.PI, y: 0, z: 0 },      // -Y up = 6
  };
  return rotations[value] || { x: 0, y: 0, z: 0 };
}

function animateDiceRoll3D(val1, val2) {
  if (!diceGroup || !scene3D) return;

  diceGroup.visible = true;
  diceGroup.position.set(0, 3, 0);
  diceAnimating = true;

  const targets = [getDiceRotationForValue(val1), getDiceRotationForValue(val2)];

  dice3D.forEach((die, i) => {
    die.position.set(i * 1.2 - 0.6, 1.5, 0);
    die.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
    die.userData.animPhase = 'rolling';
    die.userData.animTime = 0;
    die.userData.rotSpeed = {
      x: 8 + Math.random() * 6,
      z: 8 + Math.random() * 6,
    };
    die.userData.targetRot = targets[i];
  });
}

// ============================================================
// UPDATE FROM GAME STATE
// ============================================================
function updateBoard3D(room) {
  if (!scene3D || !boardGroup || !room) return;

  // Track turn changes for day/night
  if (room.currentPlayerIndex !== previousTurnIndex) {
    previousTurnIndex = room.currentPlayerIndex;
    turnCounter++;
    if (turnCounter % 10 === 0) {
      toggleDayNight();
    }
  }

  // Update cell highlights & ownership
  for (let i = 0; i < 40; i++) {
    const cellMesh = cellMeshes[i];
    if (!cellMesh) continue;

    const prop = room.properties[i];
    const cellData = BOARD_DATA[i];

    // Reset highlight
    cellMesh.material.emissive = new THREE.Color(0x000000);
    cellMesh.material.emissiveIntensity = 0;

    // Ownership tint
    if (prop) {
      const owner = room.players.find(p => p.id === prop.ownerId);
      if (owner) {
        cellMesh.material.emissive = new THREE.Color(owner.color);
        cellMesh.material.emissiveIntensity = prop.mortgaged ? 0.02 : 0.08;
      }

      // Mortgaged: darken
      if (prop.mortgaged) {
        cellMesh.material.color.setHex(0x888888);
      } else {
        cellMesh.material.color.setHex(0xf5f0e8);
      }

      // Owner flag
      const flagKey = `flag_${i}`;
      if (!ownerFlags[flagKey] && owner) {
        const flag = createOwnerFlag(owner.color);
        const pos = getCellPosition3D(i);
        flag.position.set(pos.x, CELL_HEIGHT, pos.z);
        boardGroup.add(flag);
        ownerFlags[flagKey] = flag;
      } else if (ownerFlags[flagKey] && owner) {
        // Update color if owner changed
        const flagMesh = ownerFlags[flagKey].children[1];
        if (flagMesh) {
          flagMesh.material.color.set(owner.color);
          flagMesh.material.emissive.set(owner.color);
        }
      }

      // Houses / Hotel
      updateHousesForCell(i, prop.houses);
    } else {
      cellMesh.material.color.setHex(0xf5f0e8);
      // Remove flag if property became unowned
      const flagKey = `flag_${i}`;
      if (ownerFlags[flagKey]) {
        boardGroup.remove(ownerFlags[flagKey]);
        delete ownerFlags[flagKey];
      }
      // Remove houses
      updateHousesForCell(i, 0);
    }
  }

  // Highlight current player's cell
  const currentPlayer = room.players[room.currentPlayerIndex];
  if (currentPlayer && !currentPlayer.bankrupt) {
    const cellMesh = cellMeshes[currentPlayer.position];
    if (cellMesh) {
      cellMesh.material.emissive = new THREE.Color(0xd4af37);
      cellMesh.material.emissiveIntensity = 0.3;
    }
  }

  // Update player tokens
  updatePlayerTokens(room);

  // Update city zones based on monopoly ownership
  updateCityZones(room);
}

function updateHousesForCell(cellIndex, houseCount) {
  const key = `houses_${cellIndex}`;

  // Remove existing
  if (houseModels[key]) {
    houseModels[key].forEach(m => boardGroup.remove(m));
    delete houseModels[key];
  }

  if (houseCount <= 0) return;

  const pos = getCellPosition3D(cellIndex);
  const size = getCellSize3D(cellIndex);
  const models = [];

  if (houseCount === 5) {
    // Hotel
    const hotel = createHotelModel();
    hotel.position.set(pos.x, CELL_HEIGHT, pos.z);
    hotel.scale.set(0.8, 0.8, 0.8);
    boardGroup.add(hotel);
    models.push(hotel);
  } else {
    // Houses
    for (let h = 0; h < houseCount; h++) {
      const house = createHouseModel();
      const offset = (h - (houseCount - 1) / 2) * 0.35;

      let hx = pos.x, hz = pos.z;
      if (cellIndex >= 1 && cellIndex <= 9) { hx += offset; hz -= size.h / 4; }
      else if (cellIndex >= 11 && cellIndex <= 19) { hx += size.w / 4; hz += offset; }
      else if (cellIndex >= 21 && cellIndex <= 29) { hx += offset; hz += size.h / 4; }
      else if (cellIndex >= 31 && cellIndex <= 39) { hx -= size.w / 4; hz += offset; }

      house.position.set(hx, CELL_HEIGHT, hz);
      house.scale.set(0.7, 0.7, 0.7);
      boardGroup.add(house);
      models.push(house);
    }
  }

  houseModels[key] = models;
}

function updatePlayerTokens(room) {
  const activePlayers = room.players.filter(p => !p.bankrupt);
  const existingIds = new Set(Object.keys(playerTokens));

  // Position grouping
  const posMap = {};
  activePlayers.forEach(p => {
    if (!posMap[p.position]) posMap[p.position] = [];
    posMap[p.position].push(p);
  });

  activePlayers.forEach((player, idx) => {
    let token = playerTokens[player.id];

    if (!token) {
      // Create new token
      const tokenType = TOKEN_TYPES[idx % TOKEN_TYPES.length];
      token = createTokenModel(tokenType, player.color);
      token.userData = { playerId: player.id, baseY: CELL_HEIGHT + 0.05, phase: Math.random() * Math.PI * 2, targetPos: null, animating: false };
      scene3D.add(token);
      playerTokens[player.id] = token;
    }

    existingIds.delete(player.id);

    // Target position
    const cellPos = getCellPosition3D(player.position);
    const siblings = posMap[player.position] || [];
    const sibIdx = siblings.indexOf(player);
    const offsetX = (sibIdx % 2) * 0.5 - 0.25;
    const offsetZ = Math.floor(sibIdx / 2) * 0.5 - 0.25;

    const targetX = cellPos.x + offsetX;
    const targetZ = cellPos.z + offsetZ;
    const targetY = CELL_HEIGHT + 0.05;

    // Smooth movement
    if (!token.userData.animating) {
      const dx = targetX - token.position.x;
      const dz = targetZ - token.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 0.1) {
        token.userData.animating = true;
        token.userData.baseY = targetY;

        // Hop animation
        const startPos = token.position.clone();
        const startTime = clock.getElapsedTime();
        const duration = Math.min(1.0, dist * 0.1);

        function animateToken() {
          const now = clock.getElapsedTime();
          const t = Math.min(1, (now - startTime) / duration);
          const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

          token.position.x = startPos.x + dx * eased;
          token.position.z = startPos.z + dz * eased;
          token.position.y = targetY + Math.sin(t * Math.PI) * 0.5; // hop

          // Slight tilt during movement
          token.rotation.z = Math.sin(t * Math.PI) * 0.15;

          if (t < 1) {
            requestAnimationFrame(animateToken);
          } else {
            token.position.set(targetX, targetY, targetZ);
            token.rotation.z = 0;
            token.userData.animating = false;
          }
        }
        animateToken();
      } else {
        token.position.x = targetX;
        token.position.z = targetZ;
        token.userData.baseY = targetY;
      }
    }

    // Jail bars
    const jailBarsName = `jailBars_${player.id}`;
    let jailBars = scene3D.getObjectByName(jailBarsName);
    if (player.inJail) {
      if (!jailBars) {
        jailBars = createJailBars();
        jailBars.name = jailBarsName;
        scene3D.add(jailBars);
      }
      jailBars.position.copy(token.position);
      jailBars.visible = true;
    } else if (jailBars) {
      jailBars.visible = false;
    }

    token.visible = true;
  });

  // Remove tokens for bankrupt/removed players
  existingIds.forEach(id => {
    const token = playerTokens[id];
    if (token) {
      // Bankruptcy explosion effect
      spawnBankruptParticles(token.position);
      scene3D.remove(token);
      delete playerTokens[id];
    }
    // Also remove jail bars
    const jailBars = scene3D.getObjectByName(`jailBars_${id}`);
    if (jailBars) scene3D.remove(jailBars);
  });
}

function spawnBankruptParticles(position) {
  const count = 30;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = position.x;
    positions[i * 3 + 1] = position.y + 0.3;
    positions[i * 3 + 2] = position.z;
    velocities.push({
      x: (Math.random() - 0.5) * 0.1,
      y: Math.random() * 0.08 + 0.02,
      z: (Math.random() - 0.5) * 0.1,
    });
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0xff4444, size: 0.1, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  const particles = new THREE.Points(geo, mat);
  particles.name = 'moneyParticles'; // reuse the same cleanup logic
  particles.userData = { velocities, life: 0, maxLife: 50 };
  scene3D.add(particles);
}

function updateCityZones(room) {
  if (!cityGroup) return;

  const colorGroups = ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'blue'];

  colorGroups.forEach(group => {
    const zoneObj = cityGroup.getObjectByName(`zone_${group}`);
    if (!zoneObj) return;

    const groupCells = COLOR_GROUPS_3D[group];
    if (!groupCells) return;

    // Check if any single player owns all cells in this group
    const owners = groupCells.map(cid => room.properties[cid]?.ownerId).filter(Boolean);
    const uniqueOwners = [...new Set(owners)];
    const isMonopoly = uniqueOwners.length === 1 && owners.length === groupCells.length;
    const isMortgaged = groupCells.some(cid => room.properties[cid]?.mortgaged);

    zoneObj.children.forEach(child => {
      if (child.name && child.name.startsWith('building_')) {
        if (isMonopoly && !isMortgaged) {
          // Upgraded: taller, brighter
          child.scale.y = 1.5;
          if (child.material) {
            child.material.emissive = child.material.color;
            child.material.emissiveIntensity = 0.2;
          }
        } else if (isMortgaged) {
          // Abandoned: grey, small
          child.scale.y = 0.7;
          if (child.material) {
            child.material.color.setHex(0x666666);
            child.material.emissiveIntensity = 0;
          }
        } else {
          // Normal
          child.scale.y = 1;
          if (child.material) child.material.emissiveIntensity = 0;
        }
      }
    });
  });
}

// ============================================================
// DAY/NIGHT CYCLE
// ============================================================
function toggleDayNight() {
  isDayTime = !isDayTime;

  const sun = scene3D.getObjectByName('sun');
  const ambient = scene3D.getObjectByName('ambient');

  if (isDayTime) {
    if (sun) { sun.intensity = 1.2; sun.color.setHex(0xfff5e0); }
    if (ambient) { ambient.intensity = 0.6; ambient.color.setHex(0x404060); }
    scene3D.background = new THREE.Color(0x87CEEB);
    scene3D.fog = new THREE.FogExp2(0x87CEEB, 0.005);
  } else {
    if (sun) { sun.intensity = 0.3; sun.color.setHex(0x4466aa); }
    if (ambient) { ambient.intensity = 0.2; ambient.color.setHex(0x101030); }
    scene3D.background = new THREE.Color(0x0a0a1a);
    scene3D.fog = new THREE.FogExp2(0x0a0a1a, 0.008);

    // Light up city windows
    cityGroup.traverse(obj => {
      if (obj.name === 'cityWindow' && obj.material) {
        obj.material.emissiveIntensity = Math.random() > 0.3 ? 0.5 : 0;
      }
    });
  }
}

// ============================================================
// TOOLTIP / HOVER / CLICK
// ============================================================
function onBoardMouseMove(event) {
  const container = document.getElementById('three-container');
  const rect = container.getBoundingClientRect();
  mouse3D.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse3D.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster3D.setFromCamera(mouse3D, camera3D);
  const intersects = raycaster3D.intersectObjects(cellMeshes, false);

  const tooltip = document.getElementById('tooltip-3d');

  if (intersects.length > 0) {
    const cellIndex = intersects[0].object.userData.cellIndex;
    if (cellIndex !== highlightedCell) {
      // Unhighlight previous
      if (highlightedCell >= 0 && cellMeshes[highlightedCell]) {
        cellMeshes[highlightedCell].position.y = CELL_HEIGHT / 2;
      }
      highlightedCell = cellIndex;
      // Highlight current
      if (cellMeshes[highlightedCell]) {
        cellMeshes[highlightedCell].position.y = CELL_HEIGHT / 2 + 0.05;
      }

      // Show tooltip
      const cell = BOARD_DATA[cellIndex];
      const room = typeof currentRoom !== 'undefined' ? currentRoom : null;
      const prop = room?.properties?.[cellIndex];

      let html = `<h5>${cell.name}</h5>`;
      if (cell.price > 0) html += `<div>${cell.price}$</div>`;
      if (prop) {
        const owner = room.players.find(p => p.id === prop.ownerId);
        html += `<div style="color:${owner?.color || '#fff'};">${owner?.name || '?'}</div>`;
        if (prop.houses > 0) html += `<div>${prop.houses === 5 ? '\u041E\u0442\u0435\u043B\u044C' : `\u0414\u043E\u043C\u043E\u0432: ${prop.houses}`}</div>`;
        if (prop.mortgaged) html += `<div style="color:#ff4444;">\u0417\u0410\u041B\u041E\u0413</div>`;
      } else if (cell.price > 0) {
        html += `<div style="color:#aaa;">\u0421\u0432\u043E\u0431\u043E\u0434\u043D\u0430</div>`;
      }

      tooltip.innerHTML = html;
      tooltip.style.display = 'block';
      tooltip.style.left = (event.clientX - rect.left + 15) + 'px';
      tooltip.style.top = (event.clientY - rect.top + 15) + 'px';
    } else {
      tooltip.style.left = (event.clientX - rect.left + 15) + 'px';
      tooltip.style.top = (event.clientY - rect.top + 15) + 'px';
    }
  } else {
    if (highlightedCell >= 0 && cellMeshes[highlightedCell]) {
      cellMeshes[highlightedCell].position.y = CELL_HEIGHT / 2;
    }
    highlightedCell = -1;
    tooltip.style.display = 'none';
  }
}

function onBoardClick(event) {
  if (highlightedCell >= 0) {
    const container = document.getElementById('three-container');
    const rect = container.getBoundingClientRect();
    showCellInfo(highlightedCell, event.clientX, event.clientY);
  }
}

function onBoardTouch(event) {
  if (!event.touches.length) return;
  const touch = event.touches[0];
  const container = document.getElementById('three-container');
  const rect = container.getBoundingClientRect();
  mouse3D.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
  mouse3D.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster3D.setFromCamera(mouse3D, camera3D);
  const intersects = raycaster3D.intersectObjects(cellMeshes, false);
  if (intersects.length > 0) {
    const cellIndex = intersects[0].object.userData.cellIndex;
    showCellInfo(cellIndex, touch.clientX, touch.clientY);
  }
}

// ============================================================
// DISPOSE (cleanup)
// ============================================================
function disposeBoard3D() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  if (renderer3D) {
    renderer3D.dispose();
    const canvas = renderer3D.domElement;
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    renderer3D = null;
  }

  if (scene3D) {
    scene3D.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    scene3D = null;
  }

  camera3D = null;
  controls3D = null;
  boardGroup = null;
  cityGroup = null;
  playerTokens = {};
  houseModels = {};
  ownerFlags = {};
  cellMeshes = [];
  dice3D = [];
  diceGroup = null;
  fireflies = null;
  highlightedCell = -1;
  diceAnimating = false;
  turnCounter = 0;
  previousTurnIndex = -1;
}
