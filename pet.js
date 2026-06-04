/**
 * pet.js — Three.js 3D Pet Renderer for DeepTrck
 * Loads GLB models, applies custom colours per archetype,
 * adds proper lighting, idle float + bounce animations, no manual zoom.
 */

// ─── CSS ─────────────────────────────────────────────────────────────────────
(function injectCSS() {
  if (document.getElementById('pet-anim-css')) return;
  const s = document.createElement('style');
  s.id = 'pet-anim-css';
  s.textContent = `
    @keyframes petFloat    { 0%,100%{transform:translateY(0)}   50%{transform:translateY(-8px)} }
    @keyframes petBounceIn { 0%{transform:scale(.7) translateY(18px);opacity:0}
                             60%{transform:scale(1.07) translateY(-4px);opacity:1}
                             80%{transform:scale(.97) translateY(1px)}
                            100%{transform:scale(1) translateY(0);opacity:1} }
    @keyframes moodPulse   { 0%,100%{opacity:.55} 50%{opacity:1} }
    @keyframes twinkle     { 0%,100%{opacity:0;transform:scale(.3) rotate(0deg)}
                              50%{opacity:1;transform:scale(1.4) rotate(30deg)} }
    @keyframes heartPop    { 0%{transform:scale(0) translateY(0);opacity:1}
                             60%{transform:scale(1.4) translateY(-20px);opacity:1}
                            100%{transform:scale(.8) translateY(-38px);opacity:0} }
    @keyframes sleepFloat  { 0%{transform:translateY(0) scale(1);opacity:.9}
                            100%{transform:translateY(-25px) scale(1.4);opacity:0} }
    @keyframes groundPulse { 0%,100%{opacity:.4} 50%{opacity:.8} }
    @keyframes loadSpin    { to{transform:rotate(360deg)} }

    .pet-sparkle { position:absolute;pointer-events:none;font-size:.8rem;
                   animation:twinkle 2.2s ease-in-out infinite; }
    .pet-heart   { position:absolute;pointer-events:none;font-size:1.1rem;
                   animation:heartPop .9s ease-out forwards;z-index:30; }
    .pet-zzz     { position:absolute;pointer-events:none;font-size:.9rem;
                   color:#a5b4fc;font-weight:800;
                   animation:sleepFloat 2.2s ease-in-out infinite; }
    .pet-ground  { animation:groundPulse 3s ease-in-out infinite; }
    .pet-canvas-wrap { animation:petFloat 3.5s ease-in-out infinite; }
    .pet-canvas-wrap.bounce { animation:petBounceIn .65s cubic-bezier(.22,1,.36,1) forwards,
                                         petFloat 3.5s ease-in-out .65s infinite; }
  `;
  document.head.appendChild(s);
})();

// ─── Archetype config ─────────────────────────────────────────────────────────
const PET_CONFIG = {
  kitten: { glb:'animal-cat.glb',    bodyColor:0xf4a261, accentColor:0xe76f51, name:'Focus Kitten', personality:'Gentle & jumpy'  },
  owl:    { glb:'animal-bunny.glb',  bodyColor:0xa8dadc, accentColor:0x457b9d, name:'Study Owl',    personality:'Wise & curious'   },
  fox:    { glb:'animal-fox.glb',    bodyColor:0xe76f51, accentColor:0xf4a261, name:'Swift Fox',    personality:'Quick & clever'   },
  bear:   { glb:'animal-panda.glb',  bodyColor:0x8ecae6, accentColor:0x219ebc, name:'Cozy Bear',   personality:'Calm & steady'    },
  cat:    { glb:'animal-cat.glb',    bodyColor:0xf4a261, accentColor:0xe76f51, name:'Focus Kitten', personality:'Gentle & jumpy'  },
  tiger:  { glb:'animal-tiger.glb',  bodyColor:0xfb8500, accentColor:0xffb703, name:'Tiger',        personality:'Bold & fierce'    },
  lion:   { glb:'animal-lion.glb',   bodyColor:0xffb703, accentColor:0xfb8500, name:'Lion',         personality:'Proud & strong'   },
  panda:  { glb:'animal-panda.glb',  bodyColor:0xf1faee, accentColor:0x1d3557, name:'Panda',        personality:'Calm & steady'    },
  bunny:  { glb:'animal-bunny.glb',  bodyColor:0xffd6ff, accentColor:0xc77dff, name:'Bunny',        personality:'Bouncy & sweet'   },
  dog:    { glb:'animal-dog.glb',    bodyColor:0xd4a373, accentColor:0xa98467, name:'Dog',           personality:'Loyal & playful'  },
};

const MOOD = {
  Happy:   { color:'#34d399', bg:'radial-gradient(ellipse at 50% 115%,#0c2a1c 0%,#080f1e 100%)', glow:'#34d39966', emoji:'😄' },
  Okay:    { color:'#fbbf24', bg:'radial-gradient(ellipse at 50% 115%,#27190a 0%,#080f1e 100%)', glow:'#fbbf2455', emoji:'🙂' },
  Hungry:  { color:'#f97316', bg:'radial-gradient(ellipse at 50% 115%,#2a1108 0%,#080f1e 100%)', glow:'#f9731655', emoji:'😟' },
  Fatigued:{ color:'#ef4444', bg:'radial-gradient(ellipse at 50% 115%,#2a0808 0%,#080f1e 100%)', glow:'#ef444455', emoji:'😴' },
};

const SPARKLE_POS = [
  {top:'12%',left:'8%', delay:'0s'  }, {top:'22%',right:'10%',delay:'.7s' },
  {top:'55%',left:'5%', delay:'1.4s'}, {top:'65%',right:'7%', delay:'.35s'},
  {top:'38%',left:'15%',delay:'1.9s'},
];

window.PET_SHOP = { food:[
  {id:'kibble',      name:'Kibble',      icon:'🥣',cost:10, hunger:10,hungerPct:'+10%'},
  {id:'berry_snack', name:'Berry Snack', icon:'🍓',cost:20, hunger:18,hungerPct:'+18%'},
  {id:'milk_treat',  name:'Milk Treat',  icon:'🥛',cost:30, hunger:22,hungerPct:'+22%'},
  {id:'fresh_fish',  name:'Fresh Fish',  icon:'🐟',cost:40, hunger:30,hungerPct:'+30%'},
  {id:'healthy_meal',name:'Healthy Meal',icon:'🍱',cost:60, hunger:40,hungerPct:'+40%'},
]};

// ─── Three.js scene registry (one per container) ──────────────────────────────
const _scenes = {};

function destroyScene(containerId) {
  const sc = _scenes[containerId];
  if (!sc) return;
  cancelAnimationFrame(sc.raf);
  sc.renderer.dispose();
  delete _scenes[containerId];
}

// ─── Load Three.js + GLTFLoader then init ─────────────────────────────────────
let _threeReady = false;
let _threeQueue = [];

function withThree(fn) {
  if (window.THREE && window.THREE.GLTFLoader) { _threeReady=true; fn(); return; }
  if (_threeReady) { fn(); return; }
  _threeQueue.push(fn);
  if (_threeQueue.length > 1) return; // already loading

  const loadScript = (src, type) => new Promise(res => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; if(type) s.type = type;
    s.onload = res; document.head.appendChild(s);
  });

  const _THREE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const _GLTF_SRC  = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/js/loaders/GLTFLoader.js';
  const flush = () => { _threeReady=true; _threeQueue.forEach(f=>f()); _threeQueue=[]; };
  const ld = (src) => new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
  ld(_THREE_SRC).then(()=>ld(_GLTF_SRC)).then(flush).catch(e=>console.error('[pet] THREE load failed',e));
}

// ─── Build Three.js scene inside a canvas ─────────────────────────────────────
function buildThreeScene(canvasEl, glbSrc, config, moodKey, onReady) {
  const THREE = window.THREE;
  const w = canvasEl.clientWidth  || canvasEl.offsetWidth  || 320;
  const h = canvasEl.clientHeight || canvasEl.offsetHeight || 220;

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  // Scene
  const scene = new THREE.Scene();

  // Camera — orthographic-ish feel with low FOV
  const camera = new THREE.PerspectiveCamera(28, w / h, 0.01, 100);
  camera.position.set(0, 1.1, 5.5);
  camera.lookAt(0, 0.5, 0);

  // Lighting — the key to colour!
  // 1. Ambient — soft base fill
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  // 2. Key light — warm from top-left
  const keyLight = new THREE.DirectionalLight(0xfff5e0, 2.2);
  keyLight.position.set(3, 5, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(512, 512);
  scene.add(keyLight);

  // 3. Fill light — cool from right
  const fillLight = new THREE.DirectionalLight(0xd0e8ff, 0.9);
  fillLight.position.set(-3, 2, 2);
  scene.add(fillLight);

  // 4. Rim / back light — mood-coloured glow from behind
  const moodHex = { Happy:0x34d399, Okay:0xfbbf24, Hungry:0xf97316, Fatigued:0xef4444 };
  const rimLight = new THREE.PointLight(moodHex[moodKey] || 0x34d399, 2.5, 8);
  rimLight.position.set(0, 0.5, -2.5);
  scene.add(rimLight);

  // 5. Under-glow — mood colour from below
  const underLight = new THREE.PointLight(moodHex[moodKey] || 0x34d399, 1.2, 6);
  underLight.position.set(0, -1.5, 1);
  scene.add(underLight);

  // Shadow plane
  const planeGeo = new THREE.CircleGeometry(1.2, 32);
  const planeMat = new THREE.MeshBasicMaterial({ color: moodHex[moodKey]||0x34d399, transparent:true, opacity:.12 });
  const plane = new THREE.Mesh(planeGeo, planeMat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.01;
  scene.add(plane);

  // Load GLB
  const loader = new THREE.GLTFLoader();
  loader.load(glbSrc, (gltf) => {
    const model = gltf.scene;

    // Auto-centre & scale
    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const ctr  = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale  = 1.6 / maxDim;
    model.scale.setScalar(scale);
    model.position.sub(ctr.multiplyScalar(scale));
    model.position.y += 0.05; // sit just above ground

    // Preserve the GLB's embedded textures — just enable shadows & double-sided
    model.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => {
          m.side = THREE.FrontSide;
          m.needsUpdate = true;
        });
      }
    });

    model.castShadow = true;
    scene.add(model);

    // Animate
    let t = 0;
    const tick = () => {
      t += 0.016;
      // Gentle float bob
      model.position.y = 0.05 + Math.sin(t * 1.6) * 0.06;
      // Subtle head-bob rotation
      model.rotation.y = Math.sin(t * 0.7) * 0.12;

      // Rim light pulse with mood colour
      rimLight.intensity = 2.2 + Math.sin(t * 2.1) * 0.6;

      renderer.render(scene, camera);
      sc.raf = requestAnimationFrame(tick);
    };
    sc.raf = requestAnimationFrame(tick);

    onReady?.();
  }, undefined, (err) => {
    console.error('GLB load error:', err);
  });

  const sc = { renderer, scene, camera };
  return sc;
}

// ─── Pet face expressions based on mood ──────────────────────────────────────
const PET_FACES = {
  Happy:   { face: '😄', label: 'Happy!',   anim: 'petFloat 2.5s ease-in-out infinite' },
  Okay:    { face: '🙂', label: 'Okay',      anim: 'petFloat 3s ease-in-out infinite' },
  Hungry:  { face: '😟', label: 'Hungry…',  anim: 'petFloat 4s ease-in-out infinite' },
  Fatigued:{ face: '😴', label: 'Fatigued', anim: 'petFloat 5s ease-in-out infinite' },
};

// Registry: containerId → face element
const _faceEls = {};

window._updatePetFace = function(containerId, moodKey) {
  const el = _faceEls[containerId];
  if (!el) return;
  const f = PET_FACES[moodKey] || PET_FACES.Happy;
  el.textContent = f.face;
  el.title = f.label;
  el.style.animation = f.anim;
  // Shake animation on hunger/fatigue
  if (moodKey === 'Hungry' || moodKey === 'Fatigued') {
    el.style.filter = 'drop-shadow(0 0 6px #f9731688)';
  } else if (moodKey === 'Happy') {
    el.style.filter = 'drop-shadow(0 0 6px #34d39988)';
  } else {
    el.style.filter = '';
  }
};

// ─── Build the full pet panel scene div ──────────────────────────────────────
function buildScene(containerId, glbSrc, config, moodKey) {
  const m = MOOD[moodKey] || MOOD.Happy;

  destroyScene(containerId);

  const wrap = document.createElement('div');
  wrap.style.cssText = `position:relative;border-radius:16px;overflow:hidden;
    background:${m.bg};border:1.5px solid ${m.glow};
    box-shadow:0 0 40px ${m.glow}, inset 0 0 50px rgba(0,0,0,.5);
    height:230px;margin-bottom:.7rem;`;

  // Ground glow
  const ground = document.createElement('div');
  ground.className = 'pet-ground';
  ground.style.cssText = `position:absolute;bottom:0;left:0;right:0;height:50px;z-index:1;pointer-events:none;
    background:radial-gradient(ellipse at 50% 100%,${m.color}55 0%,transparent 70%);`;
  wrap.appendChild(ground);

  // Sparkles
  SPARKLE_POS.forEach(pos => {
    const sp = document.createElement('div');
    sp.className = 'pet-sparkle'; sp.textContent = '✦'; sp.style.color = m.color;
    Object.assign(sp.style, pos);
    wrap.appendChild(sp);
  });

  // Mood badge
  const badge = document.createElement('div');
  badge.style.cssText = `position:absolute;top:9px;right:9px;z-index:20;
    background:rgba(0,0,0,.65);backdrop-filter:blur(6px);border-radius:999px;
    padding:3px 10px;font-size:.65rem;font-weight:700;color:${m.color};
    border:1px solid ${m.glow};animation:moodPulse 2.5s ease-in-out infinite;`;
  badge.textContent = `${m.emoji} ${moodKey}`;
  wrap.appendChild(badge);

  // Dynamic face expression overlay
  const faceEl = document.createElement('div');
  faceEl.id = 'pet-face-' + containerId;
  const fData = PET_FACES[moodKey] || PET_FACES.Happy;
  faceEl.textContent = fData.face;
  faceEl.title = fData.label;
  faceEl.style.cssText = `position:absolute;bottom:38px;left:50%;transform:translateX(-50%);
    z-index:22;font-size:2.2rem;pointer-events:none;
    filter:${moodKey==='Happy'?'drop-shadow(0 0 6px #34d39988)':moodKey==='Hungry'||moodKey==='Fatigued'?'drop-shadow(0 0 6px #f9731688)':''};
    animation:${fData.anim};`;
  wrap.appendChild(faceEl);
  _faceEls[containerId] = faceEl;

  // Zzz
  if (moodKey === 'Fatigued') {
    [{top:'28%',left:'58%',delay:'0s'},{top:'18%',left:'68%',delay:'.9s'},{top:'12%',left:'54%',delay:'1.7s'}]
      .forEach(p => {
        const z = document.createElement('div');
        z.className='pet-zzz'; Object.assign(z.style,p); z.textContent='z'; wrap.appendChild(z);
      });
  }

  // Loading overlay
  const ov = document.createElement('div');
  ov.id = 'pet-load-ov-'+containerId;
  ov.style.cssText = `position:absolute;inset:0;z-index:25;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:.6rem;background:${m.bg};border-radius:16px;
    transition:opacity .5s ease;`;
  ov.innerHTML = `
    <div style="width:32px;height:32px;border:3px solid ${m.color}44;border-top-color:${m.color};
      border-radius:50%;animation:loadSpin .8s linear infinite"></div>
    <div style="font-size:.68rem;color:${m.color};font-weight:600">Loading ${config.name}…</div>`;
  wrap.appendChild(ov);

  // Emoji display — same approach as Pet World tab (no GLB needed)
  const EMOJI_MAP = { kitten:'🐱', cat:'🐱', owl:'🦉', fox:'🦊', bear:'🐻', tiger:'🐯', lion:'🦁', panda:'🐼', bunny:'🐰', dog:'🐶' };
  const arch = Object.keys(PET_CONFIG).find(k => PET_CONFIG[k] === config) || 'kitten';
  const petEmoji = (window.PET_ARCHETYPES && window.PET_ARCHETYPES[arch] && window.PET_ARCHETYPES[arch].emoji) || EMOJI_MAP[arch] || '🐾';

  const emojiWrap = document.createElement('div');
  emojiWrap.className = 'pet-canvas-wrap bounce';
  emojiWrap.style.cssText = 'position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;';
  const emojiEl = document.createElement('div');
  emojiEl.style.cssText = 'font-size:5.5rem;filter:drop-shadow(0 0 18px ' + m.glow + ');line-height:1;';
  emojiEl.textContent = petEmoji;
  emojiWrap.appendChild(emojiEl);
  wrap.appendChild(emojiWrap);

  // Remove loading overlay immediately
  setTimeout(() => {
    const o = document.getElementById('pet-load-ov-'+containerId);
    if (o) { o.style.opacity='0'; setTimeout(()=>o.remove(),300); }
  }, 50);

  return wrap;
}

// ─── Spawn hearts ─────────────────────────────────────────────────────────────
window._petSpawnHearts = function(wrap) {
  ['❤️','💛','💚','💜','🩵'].forEach((em,i) => setTimeout(() => {
    const h = document.createElement('div');
    h.className='pet-heart'; h.textContent=em;
    h.style.cssText=`left:${20+Math.random()*60}%;top:${35+Math.random()*25}%;`;
    wrap.appendChild(h);
    setTimeout(()=>h.remove(),1000);
  },i*130));
};

// ─── Tab helpers ──────────────────────────────────────────────────────────────
const _tabs = {};

function foodHTML() {
  return window.PET_SHOP.food.map(f=>`
    <div style="display:flex;flex-direction:column;align-items:center;gap:3px;
      background:var(--bg3);border-radius:10px;padding:.48rem .28rem;
      border:1px solid var(--border);cursor:pointer;
      transition:transform .15s,border-color .15s,box-shadow .15s"
      onclick="window.feedPet('${f.id}')"
      onmouseover="this.style.transform='scale(1.08)';this.style.borderColor='var(--accent)';this.style.boxShadow='0 0 10px var(--accent)44'"
      onmouseout="this.style.transform='';this.style.borderColor='var(--border)';this.style.boxShadow=''">
      <span style="font-size:1.4rem">${f.icon}</span>
      <span style="font-size:.6rem;font-weight:600;color:var(--text1)">${f.name}</span>
      <span style="font-size:.57rem;color:var(--green)">${f.hungerPct}</span>
      <span style="font-size:.57rem;color:var(--amber)">⚡${f.cost}</span>
    </div>`).join('');
}

function accHTML(eq) {
  return [{id:'scholar_specs',name:'Scholar Specs',icon:'🤓',cost:120,bonus:'+2 XP/task'},
          {id:'cozy_scarf',   name:'Cozy Scarf',   icon:'🧣',cost:200,bonus:'-20% hunger'},
          {id:'focus_crown',  name:'Focus Crown',  icon:'👑',cost:500,bonus:'+5% XP'}]
  .map(w=>{const on=(eq||[]).includes(w.id); return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:3px;
      background:var(--bg3);border-radius:10px;padding:.48rem .28rem;
      border:1px solid ${on?'var(--accent)':'var(--border)'};cursor:pointer;
      transition:transform .15s,box-shadow .15s"
      onclick="window.buyWardrobeItem('${w.id}')"
      onmouseover="this.style.transform='scale(1.08)';this.style.boxShadow='0 0 10px var(--accent)44'"
      onmouseout="this.style.transform='';this.style.boxShadow=''">
      <span style="font-size:1.4rem">${w.icon}</span>
      <span style="font-size:.6rem;font-weight:600;color:var(--text1)">${w.name}</span>
      <span style="font-size:.57rem;color:var(--text2)">${w.bonus}</span>
      <span style="font-size:.57rem;color:${on?'var(--green)':'var(--amber)'}">${on?'✓ On':'⚡'+w.cost}</span>
    </div>`;}).join('');
}

function petsHTML(cur) {
  return Object.entries({
    kitten:{name:'Focus Kitten',emoji:'🐱'}, owl:{name:'Study Owl',emoji:'🦉'},
    fox:{name:'Swift Fox',emoji:'🦊'},       bear:{name:'Cozy Bear',emoji:'🐻'},
  }).map(([k,v])=>{const active=k===cur; return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:3px;
      background:var(--bg3);border-radius:10px;padding:.48rem .28rem;
      border:2px solid ${active?'var(--accent)':'var(--border)'};
      cursor:${active?'default':'pointer'};transition:transform .15s,box-shadow .15s"
      ${active?'':` onclick="window._switchPetArchetype('${k}')"`}
      onmouseover="this.style.transform='scale(1.08)'"
      onmouseout="this.style.transform=''">
      <span style="font-size:1.4rem">${v.emoji}</span>
      <span style="font-size:.6rem;font-weight:600;color:var(--text1)">${v.name}</span>
      <span style="font-size:.57rem;color:${active?'var(--accent)':'var(--text2)'}">
        ${active?'✓ Active':'Switch'}</span>
    </div>`;}).join('');
}

window._switchPetArchetype = function(arch) {
  const pet = window.getPetState?.();
  if (!pet) return;
  pet.archetype = arch;
  window.savePetState?.(pet);
  ['pet-card-content','pet-page-content'].forEach(id=>window.renderEnhancedPetCard?.(id));
};

// ─── Main render ──────────────────────────────────────────────────────────────
window.renderEnhancedPetCard = function(containerId) {
  const container = document.getElementById(containerId);
  if (!container || !window.getPetState || !window.getPetHunger) return;

  const pet = window.getPetState();

  if (!pet) {
    destroyScene(containerId);
    container.innerHTML = `
      <div style="padding:.3rem 0;text-align:center">
        <div style="font-size:2.8rem;margin-bottom:.3rem;animation:petFloat 2s ease-in-out infinite">🥚</div>
        <div style="font-weight:700;font-size:.93rem;color:var(--text1)">Hatch Your Study Buddy</div>
        <div style="font-size:.73rem;color:var(--text2);margin:.15rem 0 .85rem">Pick a companion and name it</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:.5rem;margin-bottom:.75rem">
          ${Object.entries({kitten:{name:'Focus Kitten',emoji:'🐱'},owl:{name:'Study Owl',emoji:'🦉'},fox:{name:'Swift Fox',emoji:'🦊'},bear:{name:'Cozy Bear',emoji:'🐻'}})
            .map(([k,v])=>`
            <label style="display:flex;flex-direction:column;align-items:center;gap:.25rem;
              padding:.6rem;border-radius:10px;border:2px solid var(--border);
              background:var(--bg3);cursor:pointer;transition:border-color .15s"
              onmouseover="this.style.borderColor='var(--accent)'"
              onmouseout="this.style.borderColor=this.querySelector('input').checked?'var(--accent)':'var(--border)'">
              <input type="radio" name="pet-archetype-${containerId}" value="${k}"
                ${k==='kitten'?'checked':''} style="display:none"
                onchange="this.closest('label').parentElement.querySelectorAll('label').forEach(l=>l.style.borderColor='var(--border)');this.closest('label').style.borderColor='var(--accent)'">
              <span style="font-size:1.9rem">${v.emoji}</span>
              <span style="font-size:.7rem;color:var(--text2);font-weight:600">${v.name}</span>
            </label>`).join('')}
        </div>
        <input type="text" id="pet-name-input-${containerId}" class="input"
          placeholder="Name your buddy…" style="width:100%;text-align:center;margin-bottom:.55rem;box-sizing:border-box">
        <button class="btn-primary" style="width:100%" onclick="(function(){
          const a=document.querySelector('input[name=\\'pet-archetype-${containerId}\\']:checked')?.value||'kitten';
          const n=document.getElementById('pet-name-input-${containerId}')?.value||'';
          window.hatchPet?.(a,n);
        })()">🥚 Hatch!</button>
      </div>`;
    return;
  }

  const hunger  = window.getPetHunger(pet);
  const getMood = window.getPetMood||(h=>h>=80?{mood:'Happy',color:'#34d399'}:h>=50?{mood:'Okay',color:'#fbbf24'}:h>=20?{mood:'Hungry',color:'#f97316'}:{mood:'Fatigued',color:'#ef4444'});
  const { mood, color:moodColor } = getMood(hunger);
  const config   = PET_CONFIG[pet.archetype] || PET_CONFIG.kitten;
  const activeTab = _tabs[containerId] || 'food';

  // Only rebuild Three.js if archetype/mood changed (avoid flicker on tab switch)
  const sceneKey = `${pet.archetype}-${mood}`;
  const needsNewScene = !_scenes[containerId] || _scenes[containerId]._key !== sceneKey;

  container.innerHTML = '';

  // Name row
  const nr = document.createElement('div');
  nr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem';
  nr.innerHTML=`<div style="font-weight:700;font-size:.97rem;color:var(--text1)">${pet.name}</div>
    <div style="font-size:.68rem;color:var(--text3);font-style:italic">${config.personality}</div>`;
  container.appendChild(nr);

  // Hunger bar
  const hbar = document.createElement('div');
  hbar.style.cssText='margin-bottom:.5rem';
  hbar.innerHTML=`
    <div style="display:flex;justify-content:space-between;margin-bottom:3px">
      <span style="font-size:.68rem;color:var(--text2)">Hunger</span>
      <span style="font-size:.68rem;font-weight:700;color:${moodColor}">${Math.round(hunger)}%</span>
    </div>
    <div style="height:6px;border-radius:999px;background:var(--bg3);overflow:hidden">
      <div style="height:100%;width:${hunger}%;
        background:linear-gradient(90deg,${moodColor}99,${moodColor});
        border-radius:999px;transition:width .9s cubic-bezier(.34,1.56,.64,1)"></div>
    </div>`;
  container.appendChild(hbar);

  // Sparks
  const sparksEl = document.createElement('div');
  sparksEl.style.cssText='font-size:.7rem;color:var(--amber);font-weight:700;margin-bottom:.5rem';
  sparksEl.innerHTML=`⚡ <span id="pet-sparks">${window.getCurrencyState?.().sparks||0}</span> Sparks`;
  container.appendChild(sparksEl);

  // 3D scene
  if (needsNewScene) {
    const sceneDiv = buildScene(containerId, config.glb, config, mood);
    container.appendChild(sceneDiv);
    if (_scenes[containerId]) _scenes[containerId]._key = sceneKey;
  } else {
    // Re-attach existing canvas wrapper
    const existingWrap = document.getElementById('pet-scene-wrap-'+containerId);
    if (existingWrap) container.appendChild(existingWrap);
  }

  // Dashboard card shows pet only — no tabs/shop
  if (containerId === 'pet-card-content') return;

  // Tab bar (Pet World page only)
  const tabBar = document.createElement('div');
  tabBar.style.cssText='display:flex;gap:.3rem;margin-bottom:.48rem';
  [['food','🍖 Food'],['accessories','👗 Acc'],['pets','🐾 Pets']].forEach(([tab,label])=>{
    const b=document.createElement('button');
    const on=activeTab===tab;
    b.style.cssText=`flex:1;padding:.34rem .2rem;border-radius:8px;font-size:.65rem;font-weight:600;
      border:1px solid ${on?'var(--accent)':'var(--border)'};
      background:${on?'var(--accent)22':'var(--bg3)'};
      color:${on?'var(--accent)':'var(--text2)'};cursor:pointer;transition:all .15s`;
    b.textContent=label;
    b.onclick=()=>{ _tabs[containerId]=tab; window.renderEnhancedPetCard(containerId); };
    tabBar.appendChild(b);
  });
  container.appendChild(tabBar);

  // Shop grid
  const grid=document.createElement('div');
  if (activeTab==='food') {
    grid.style.cssText='display:grid;grid-template-columns:repeat(5,1fr);gap:.3rem';
    grid.innerHTML=foodHTML();
  } else if (activeTab==='accessories') {
    grid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:.3rem';
    grid.innerHTML=accHTML(pet.equippedItems);
  } else {
    grid.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:.3rem';
    grid.innerHTML=petsHTML(pet.archetype);
  }
  container.appendChild(grid);
};

// ─── Enhanced feedPet ─────────────────────────────────────────────────────────
window.installEnhancedFeedPet = function() {
  const foods=[...(window.PET_SHOP?.food||[])];
  window.feedPet=function(foodId){
    const food=foods.find(f=>f.id===foodId)||(window.PET_FOOD||[]).find(f=>f.id===foodId);
    if(!food)return;
    const pet=window.getPetState?.();
    if(!pet){window.showToast?.('Hatch your pet first! 🥚','info');return;}
    if(!window.spendSparks?.(food.cost)){window.showToast?.('Not enough Sparks! Need '+food.cost+' ⚡','info');return;}
    const cur=window.getPetHunger?.(pet)??pet.hunger??100;
    pet.hunger=Math.min(100,cur+food.hunger);
    pet.lastFed=Date.now();
    window.savePetState?.(pet);
    window.showToast?.(food.icon+' '+pet.name+' enjoyed the '+food.name+'!','success');
    // Hearts on canvas wrapper
    const sc=document.querySelector('#pet-card-content [style*="border-radius:16px"]')||document.querySelector('#pet-page-content [style*="border-radius:16px"]');
    if(sc)window._petSpawnHearts(sc);
    ['pet-card-content','pet-page-content'].forEach(id=>window.renderEnhancedPetCard?.(id));
  };
};

if(typeof window.getPetState==='function'){
  window.installEnhancedFeedPet?.();
  setTimeout(()=>{
    window.renderEnhancedPetCard?.('pet-card-content');
    window.renderEnhancedPetCard?.('pet-page-content');
  },300);
}
