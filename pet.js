/**
 * pet.js — Enhanced Pet System for DeepTrck
 * - SVG face expressions that change with mood (no external emoji overlay)
 * - Level-based pet unlocks: Cat (1-5), Dog (6-10), Fox (11-15), Bear (16-20), Tiger (21+)
 * - Realistic animated pet faces using SVG paths
 * - Fixed hatch panel with level-unlock preview
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
    @keyframes eyeBlink    { 0%,90%,100%{transform:scaleY(1)} 95%{transform:scaleY(0.1)} }
    @keyframes tailWag     { 0%,100%{transform:rotate(-15deg)} 50%{transform:rotate(15deg)} }
    @keyframes earTwitch   { 0%,100%{transform:rotate(0deg)} 30%{transform:rotate(-8deg)} 60%{transform:rotate(5deg)} }
    @keyframes hungerShake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-3px)} 40%,80%{transform:translateX(3px)} }
    @keyframes sleepBob    { 0%,100%{transform:rotate(-5deg)} 50%{transform:rotate(5deg)} }
    @keyframes happyBounce { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-6px) scale(1.03)} }
    @keyframes fadeInUp    { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    @keyframes lockPulse   { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:.9;transform:scale(1.1)} }

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
    .pet-svg-face { filter:drop-shadow(0 4px 16px rgba(0,0,0,.45)); }
    .pet-eye-left, .pet-eye-right { transform-origin:center; animation:eyeBlink 4s ease-in-out infinite; }
    .pet-eye-right { animation-delay:.1s; }
    .pet-tail { transform-origin:bottom center; }
    .pet-ear-left, .pet-ear-right { transform-origin:bottom center; }
    .pet-body-happy { animation:happyBounce 1.8s ease-in-out infinite; }
    .pet-body-hungry { animation:hungerShake 1.2s ease-in-out infinite; }
    .pet-body-fatigued { animation:sleepBob 3s ease-in-out infinite; }
    .pet-unlock-card { animation:fadeInUp .4s ease forwards; }
    .pet-lock-icon { animation:lockPulse 2s ease-in-out infinite; }
  `;
  document.head.appendChild(s);
})();

// ─── Pet unlock levels ────────────────────────────────────────────────────────
const PET_UNLOCK_LEVELS = {
  cat:   { minLevel: 1,  name: 'Focus Cat',   personality: 'Gentle & jumpy',  color: '#f4a261', accent: '#e76f51' },
  dog:   { minLevel: 6,  name: 'Loyal Dog',   personality: 'Loyal & playful', color: '#d4a373', accent: '#a98467' },
  fox:   { minLevel: 11, name: 'Swift Fox',   personality: 'Quick & clever',  color: '#e76f51', accent: '#f4a261' },
  bear:  { minLevel: 16, name: 'Cozy Bear',   personality: 'Calm & steady',   color: '#8ecae6', accent: '#219ebc' },
  tiger: { minLevel: 21, name: 'Bold Tiger',  personality: 'Bold & fierce',   color: '#fb8500', accent: '#ffb703' },
};

// Legacy PET_CONFIG compatibility
const PET_CONFIG = {
  kitten: { name:'Focus Cat',   personality:'Gentle & jumpy',  bodyColor:0xf4a261, accentColor:0xe76f51 },
  cat:    { name:'Focus Cat',   personality:'Gentle & jumpy',  bodyColor:0xf4a261, accentColor:0xe76f51 },
  owl:    { name:'Study Owl',   personality:'Wise & curious',  bodyColor:0xa8dadc, accentColor:0x457b9d },
  fox:    { name:'Swift Fox',   personality:'Quick & clever',  bodyColor:0xe76f51, accentColor:0xf4a261 },
  bear:   { name:'Cozy Bear',   personality:'Calm & steady',   bodyColor:0x8ecae6, accentColor:0x219ebc },
  tiger:  { name:'Bold Tiger',  personality:'Bold & fierce',   bodyColor:0xfb8500, accentColor:0xffb703 },
  lion:   { name:'Lion',        personality:'Proud & strong',  bodyColor:0xffb703, accentColor:0xfb8500 },
  panda:  { name:'Panda',       personality:'Calm & steady',   bodyColor:0xf1faee, accentColor:0x1d3557 },
  bunny:  { name:'Bunny',       personality:'Bouncy & sweet',  bodyColor:0xffd6ff, accentColor:0xc77dff },
  dog:    { name:'Loyal Dog',   personality:'Loyal & playful', bodyColor:0xd4a373, accentColor:0xa98467 },
};

const MOOD = {
  Happy:   { color:'#34d399', bg:'radial-gradient(ellipse at 50% 115%,#0c2a1c 0%,#080f1e 100%)', glow:'#34d39966' },
  Okay:    { color:'#fbbf24', bg:'radial-gradient(ellipse at 50% 115%,#27190a 0%,#080f1e 100%)', glow:'#fbbf2455' },
  Hungry:  { color:'#f97316', bg:'radial-gradient(ellipse at 50% 115%,#2a1108 0%,#080f1e 100%)', glow:'#f9731655' },
  Fatigued:{ color:'#ef4444', bg:'radial-gradient(ellipse at 50% 115%,#2a0808 0%,#080f1e 100%)', glow:'#ef444455' },
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

// ─── SVG Pet Face Generator ───────────────────────────────────────────────────
function getPetSVG(archetype, mood, color, accent) {
  const m = mood || 'Happy';
  const c = color || '#f4a261';
  const a = accent || '#e76f51';

  // Eyes by mood
  const eyes = {
    Happy:   { shape: 'arc', color: '#1a0a00', shine: true  },
    Okay:    { shape: 'round', color: '#1a0a00', shine: true  },
    Hungry:  { shape: 'sad', color: '#1a0a00', shine: false },
    Fatigued:{ shape: 'closed', color: '#1a0a00', shine: false },
  }[m];

  // Mouth by mood
  const mouths = {
    Happy:   `<path d="M 78 108 Q 88 118 98 108" stroke="#1a0a00" stroke-width="2.5" fill="none" stroke-linecap="round"/>
              <path d="M 78 108 Q 88 122 98 108" stroke="${a}" stroke-width="1.5" fill="${a}44" stroke-linecap="round"/>`,
    Okay:    `<path d="M 80 110 Q 88 113 96 110" stroke="#1a0a00" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
    Hungry:  `<path d="M 80 114 Q 88 107 96 114" stroke="#1a0a00" stroke-width="2.5" fill="none" stroke-linecap="round"/>
              <path d="M 84 117 L 84 121 M 88 118 L 88 122 M 92 117 L 92 121" stroke="#f97316" stroke-width="1.5" stroke-linecap="round"/>`,
    Fatigued:`<path d="M 81 112 Q 88 109 95 112" stroke="#1a0a00" stroke-width="2" fill="none" stroke-linecap="round"/>
              <path d="M 82 116 L 94 116" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" opacity=".5"/>`,
  }[m];

  // Eye SVG helpers
  function eyeSVG(cx, cy) {
    if (m === 'Happy') return `
      <g class="pet-eye-${cx < 88 ? 'left' : 'right'}">
        <ellipse cx="${cx}" cy="${cy}" rx="6" ry="7" fill="#1a0a00"/>
        <ellipse cx="${cx+1.5}" cy="${cy-2}" rx="1.8" ry="2" fill="white" opacity=".9"/>
        <ellipse cx="${cx-1}" cy="${cy+2}" rx="1" ry="1" fill="#2d1a00" opacity=".6"/>
      </g>`;
    if (m === 'Okay') return `
      <g class="pet-eye-${cx < 88 ? 'left' : 'right'}">
        <ellipse cx="${cx}" cy="${cy}" rx="5.5" ry="6.5" fill="#1a0a00"/>
        <ellipse cx="${cx+1}" cy="${cy-2}" rx="1.5" ry="1.5" fill="white" opacity=".8"/>
      </g>`;
    if (m === 'Hungry') return `
      <g>
        <ellipse cx="${cx}" cy="${cy+1}" rx="5.5" ry="4" fill="#1a0a00"/>
        <path d="M ${cx-6} ${cy-3} Q ${cx} ${cy-7} ${cx+6} ${cy-3}" stroke="#1a0a00" stroke-width="2" fill="none"/>
      </g>`;
    if (m === 'Fatigued') return `
      <g>
        <path d="M ${cx-6} ${cy} Q ${cx} ${cy+5} ${cx+6} ${cy}" stroke="#1a0a00" stroke-width="2.5" fill="#1a0a00" fill-opacity=".3"/>
        <path d="M ${cx-6} ${cy-1} L ${cx+6} ${cy-1}" stroke="#1a0a00" stroke-width="2.5" stroke-linecap="round"/>
      </g>`;
  }

  const bodyClass = m === 'Happy' ? 'pet-body-happy' : m === 'Hungry' ? 'pet-body-hungry' : m === 'Fatigued' ? 'pet-body-fatigued' : '';

  // Build SVG per archetype
  const arch = archetype?.toLowerCase() || 'cat';

  if (arch === 'cat' || arch === 'kitten') {
    return `<svg viewBox="0 0 176 200" xmlns="http://www.w3.org/2000/svg" class="pet-svg-face" width="140" height="160">
      <g class="${bodyClass}">
        <!-- Body -->
        <ellipse cx="88" cy="158" rx="38" ry="28" fill="${c}" opacity=".9"/>
        <!-- Belly -->
        <ellipse cx="88" cy="162" rx="22" ry="18" fill="${c}dd" opacity=".7"/>
        <!-- Inner belly lighter -->
        <ellipse cx="88" cy="163" rx="14" ry="11" fill="white" opacity=".18"/>
        <!-- Tail -->
        <path class="pet-tail" style="animation:tailWag ${m==='Happy'?'0.8s':'2s'} ease-in-out infinite;transform-origin:88px 175px"
          d="M 118 175 Q 148 155 145 130 Q 142 118 132 122 Q 125 130 130 145 Q 134 158 118 168 Z" fill="${c}"/>
        <!-- Tail tip -->
        <ellipse cx="140" cy="126" rx="8" ry="7" fill="${a}" opacity=".8"/>

        <!-- Head -->
        <ellipse cx="88" cy="90" rx="40" ry="38" fill="${c}"/>
        <!-- Head shading -->
        <ellipse cx="88" cy="86" rx="34" ry="28" fill="white" opacity=".08"/>

        <!-- Ears -->
        <polygon class="pet-ear-left" style="animation:earTwitch ${m==='Happy'?'1.5s':'4s'} ease-in-out infinite;transform-origin:65px 60px"
          points="52,68 62,38 78,62" fill="${c}"/>
        <polygon points="56,65 64,44 75,62" fill="${a}" opacity=".7"/>
        <polygon class="pet-ear-right" style="animation:earTwitch ${m==='Happy'?'1.5s':'4s'} ease-in-out infinite .3s;transform-origin:112px 60px"
          points="124,68 114,38 98,62" fill="${c}"/>
        <polygon points="120,65 112,44 101,62" fill="${a}" opacity=".7"/>

        <!-- Forehead marking -->
        <path d="M 82 72 Q 88 65 94 72 Q 88 78 82 72" fill="${a}" opacity=".4"/>
        <line x1="88" y1="66" x2="88" y2="76" stroke="${a}" stroke-width="1.5" opacity=".3"/>

        <!-- Eyes -->
        ${eyeSVG(74, 90)}
        ${eyeSVG(102, 90)}

        <!-- Nose -->
        <path d="M 85 103 L 88 100 L 91 103 Q 88 107 85 103 Z" fill="${a}"/>

        <!-- Whiskers -->
        <line x1="48" y1="100" x2="78" y2="103" stroke="#1a0a00" stroke-width="1.2" opacity=".5"/>
        <line x1="48" y1="107" x2="78" y2="106" stroke="#1a0a00" stroke-width="1.2" opacity=".4"/>
        <line x1="128" y1="100" x2="98" y2="103" stroke="#1a0a00" stroke-width="1.2" opacity=".5"/>
        <line x1="128" y1="107" x2="98" y2="106" stroke="#1a0a00" stroke-width="1.2" opacity=".4"/>

        <!-- Mouth -->
        ${mouths}

        <!-- Blush (only happy) -->
        ${m==='Happy' ? `<ellipse cx="64" cy="100" rx="9" ry="5" fill="${a}" opacity=".3"/>
        <ellipse cx="112" cy="100" rx="9" ry="5" fill="${a}" opacity=".3"/>` : ''}

        <!-- Paws -->
        <ellipse cx="66" cy="182" rx="14" ry="9" fill="${c}"/>
        <ellipse cx="110" cy="182" rx="14" ry="9" fill="${c}"/>
        <ellipse cx="61" cy="184" rx="5" ry="4" fill="${a}" opacity=".5"/>
        <ellipse cx="66" cy="185" rx="5" ry="4" fill="${a}" opacity=".5"/>
        <ellipse cx="71" cy="184" rx="5" ry="4" fill="${a}" opacity=".5"/>
        <ellipse cx="105" cy="184" rx="5" ry="4" fill="${a}" opacity=".5"/>
        <ellipse cx="110" cy="185" rx="5" ry="4" fill="${a}" opacity=".5"/>
        <ellipse cx="115" cy="184" rx="5" ry="4" fill="${a}" opacity=".5"/>

        <!-- Sleep zzz indicator -->
        ${m==='Fatigued' ? `<text x="108" y="72" font-size="11" fill="#a5b4fc" font-weight="800" opacity=".8">z</text>
        <text x="118" y="62" font-size="14" fill="#a5b4fc" font-weight="800" opacity=".6">z</text>` : ''}
      </g>
    </svg>`;
  }

  if (arch === 'dog') {
    return `<svg viewBox="0 0 176 200" xmlns="http://www.w3.org/2000/svg" class="pet-svg-face" width="140" height="160">
      <g class="${bodyClass}">
        <!-- Body -->
        <ellipse cx="88" cy="158" rx="40" ry="30" fill="${c}" opacity=".9"/>
        <ellipse cx="88" cy="163" rx="24" ry="18" fill="white" opacity=".2"/>

        <!-- Tail wagging -->
        <path class="pet-tail" style="animation:tailWag ${m==='Happy'?'0.5s':'2s'} ease-in-out infinite;transform-origin:118px 155px"
          d="M 118 155 Q 148 135 152 115 Q 155 100 144 104 Q 136 110 140 128 Q 143 145 118 148 Z" fill="${c}"/>

        <!-- Head -->
        <ellipse cx="88" cy="90" rx="42" ry="40" fill="${c}"/>
        <ellipse cx="88" cy="86" rx="36" ry="30" fill="white" opacity=".07"/>

        <!-- Floppy ears -->
        <path class="pet-ear-left" style="animation:earTwitch ${m==='Happy'?'1s':'3s'} ease-in-out infinite;transform-origin:52px 80px"
          d="M 46 60 Q 36 78 40 105 Q 44 118 56 112 Q 64 100 62 80 Z" fill="${a}"/>
        <path d="M 48 64 Q 40 80 43 104 Q 46 112 54 108 Q 60 98 58 80 Z" fill="${c}" opacity=".4"/>
        <path class="pet-ear-right" style="animation:earTwitch ${m==='Happy'?'1s':'3s'} ease-in-out infinite .4s;transform-origin:124px 80px"
          d="M 130 60 Q 140 78 136 105 Q 132 118 120 112 Q 112 100 114 80 Z" fill="${a}"/>
        <path d="M 128 64 Q 136 80 133 104 Q 130 112 122 108 Q 116 98 118 80 Z" fill="${c}" opacity=".4"/>

        <!-- Snout -->
        <ellipse cx="88" cy="107" rx="18" ry="13" fill="${c}" opacity=".8"/>
        <ellipse cx="88" cy="108" rx="14" ry="9" fill="white" opacity=".15"/>

        <!-- Eyes -->
        ${eyeSVG(74, 88)}
        ${eyeSVG(102, 88)}

        <!-- Nose -->
        <ellipse cx="88" cy="101" rx="8" ry="5" fill="#1a0a00"/>
        <ellipse cx="86" cy="100" rx="2.5" ry="1.5" fill="white" opacity=".5"/>

        <!-- Mouth -->
        ${mouths}

        <!-- Blush -->
        ${m==='Happy' ? `<ellipse cx="64" cy="98" rx="9" ry="5" fill="${a}" opacity=".3"/>
        <ellipse cx="112" cy="98" rx="9" ry="5" fill="${a}" opacity=".3"/>` : ''}

        <!-- Paws -->
        <ellipse cx="66" cy="182" rx="15" ry="10" fill="${c}"/>
        <ellipse cx="110" cy="182" rx="15" ry="10" fill="${c}"/>
        <ellipse cx="62" cy="184" rx="4" ry="3" fill="${a}" opacity=".6"/>
        <ellipse cx="67" cy="186" rx="4" ry="3" fill="${a}" opacity=".6"/>
        <ellipse cx="72" cy="184" rx="4" ry="3" fill="${a}" opacity=".6"/>
        <ellipse cx="106" cy="184" rx="4" ry="3" fill="${a}" opacity=".6"/>
        <ellipse cx="111" cy="186" rx="4" ry="3" fill="${a}" opacity=".6"/>
        <ellipse cx="116" cy="184" rx="4" ry="3" fill="${a}" opacity=".6"/>

        ${m==='Fatigued' ? `<text x="108" y="68" font-size="11" fill="#a5b4fc" font-weight="800" opacity=".8">z</text>
        <text x="118" y="56" font-size="14" fill="#a5b4fc" font-weight="800" opacity=".6">z</text>` : ''}
      </g>
    </svg>`;
  }

  if (arch === 'fox') {
    return `<svg viewBox="0 0 176 200" xmlns="http://www.w3.org/2000/svg" class="pet-svg-face" width="140" height="160">
      <g class="${bodyClass}">
        <!-- Body -->
        <ellipse cx="88" cy="158" rx="36" ry="27" fill="${c}" opacity=".9"/>
        <!-- Belly white -->
        <ellipse cx="88" cy="162" rx="20" ry="16" fill="white" opacity=".3"/>

        <!-- Fluffy tail -->
        <path class="pet-tail" style="animation:tailWag ${m==='Happy'?'0.9s':'2s'} ease-in-out infinite;transform-origin:88px 170px"
          d="M 120 170 Q 155 148 160 118 Q 164 98 148 102 Q 138 110 144 132 Q 148 150 120 162 Z" fill="${c}"/>
        <!-- Tail tip white -->
        <ellipse cx="154" cy="104" rx="10" ry="8" fill="white" opacity=".8"/>

        <!-- Head -->
        <ellipse cx="88" cy="88" rx="38" ry="36" fill="${c}"/>

        <!-- Pointed ears -->
        <polygon class="pet-ear-left" style="animation:earTwitch ${m==='Happy'?'1.2s':'4s'} ease-in-out infinite;transform-origin:65px 58px"
          points="54,72 60,34 80,64" fill="${c}"/>
        <polygon points="58,70 63,42 77,64" fill="#fff" opacity=".7"/>
        <!-- Ear inner accent -->
        <polygon points="60,67 63,46 76,62" fill="${a}" opacity=".4"/>

        <polygon class="pet-ear-right" style="animation:earTwitch ${m==='Happy'?'1.2s':'4s'} ease-in-out infinite .25s;transform-origin:111px 58px"
          points="122,72 116,34 96,64" fill="${c}"/>
        <polygon points="118,70 113,42 99,64" fill="#fff" opacity=".7"/>
        <polygon points="116,67 113,46 100,62" fill="${a}" opacity=".4"/>

        <!-- Face white mask -->
        <ellipse cx="88" cy="100" rx="26" ry="20" fill="white" opacity=".35"/>

        <!-- Eyes -->
        ${eyeSVG(73, 88)}
        ${eyeSVG(103, 88)}

        <!-- Snout (elongated for fox) -->
        <ellipse cx="88" cy="106" rx="14" ry="10" fill="white" opacity=".5"/>
        <path d="M 84 101 L 88 97 L 92 101 Q 88 105 84 101 Z" fill="#1a0a00"/>
        <ellipse cx="86" cy="100" rx="2" ry="1.5" fill="white" opacity=".6"/>

        <!-- Mouth -->
        ${mouths}

        <!-- Blush -->
        ${m==='Happy' ? `<ellipse cx="63" cy="97" rx="8" ry="4.5" fill="${a}" opacity=".35"/>
        <ellipse cx="113" cy="97" rx="8" ry="4.5" fill="${a}" opacity=".35"/>` : ''}

        <!-- Paws -->
        <ellipse cx="66" cy="181" rx="13" ry="9" fill="${c}"/>
        <ellipse cx="110" cy="181" rx="13" ry="9" fill="${c}"/>
        <ellipse cx="61" cy="183" rx="4.5" ry="3.5" fill="${a}" opacity=".5"/>
        <ellipse cx="66" cy="185" rx="4.5" ry="3.5" fill="${a}" opacity=".5"/>
        <ellipse cx="71" cy="183" rx="4.5" ry="3.5" fill="${a}" opacity=".5"/>
        <ellipse cx="105" cy="183" rx="4.5" ry="3.5" fill="${a}" opacity=".5"/>
        <ellipse cx="110" cy="185" rx="4.5" ry="3.5" fill="${a}" opacity=".5"/>
        <ellipse cx="115" cy="183" rx="4.5" ry="3.5" fill="${a}" opacity=".5"/>

        ${m==='Fatigued' ? `<text x="108" y="68" font-size="11" fill="#a5b4fc" font-weight="800" opacity=".8">z</text>
        <text x="118" y="56" font-size="14" fill="#a5b4fc" font-weight="800" opacity=".6">z</text>` : ''}
      </g>
    </svg>`;
  }

  if (arch === 'bear') {
    return `<svg viewBox="0 0 176 210" xmlns="http://www.w3.org/2000/svg" class="pet-svg-face" width="140" height="168">
      <g class="${bodyClass}">
        <!-- Big chubby body -->
        <ellipse cx="88" cy="163" rx="46" ry="35" fill="${c}" opacity=".9"/>
        <ellipse cx="88" cy="168" rx="28" ry="20" fill="white" opacity=".25"/>

        <!-- Head (wide, round bear) -->
        <ellipse cx="88" cy="92" rx="46" ry="44" fill="${c}"/>
        <ellipse cx="88" cy="88" rx="38" ry="32" fill="white" opacity=".07"/>

        <!-- Round ears -->
        <circle class="pet-ear-left" cx="52" cy="56" r="18" fill="${c}"/>
        <circle cx="52" cy="56" r="11" fill="${a}" opacity=".7"/>
        <circle cx="52" cy="56" r="6" fill="${c}" opacity=".6"/>
        <circle class="pet-ear-right" cx="124" cy="56" r="18" fill="${c}"/>
        <circle cx="124" cy="56" r="11" fill="${a}" opacity=".7"/>
        <circle cx="124" cy="56" r="6" fill="${c}" opacity=".6"/>

        <!-- Eyes (bear eyes are small) -->
        ${eyeSVG(74, 90)}
        ${eyeSVG(102, 90)}

        <!-- Big snout -->
        <ellipse cx="88" cy="108" rx="22" ry="15" fill="${c}" opacity=".7"/>
        <ellipse cx="88" cy="108" rx="16" ry="10" fill="${a}" opacity=".3"/>
        <ellipse cx="88" cy="103" rx="9" ry="6" fill="#1a0a00"/>
        <ellipse cx="85" cy="102" rx="2.5" ry="1.5" fill="white" opacity=".5"/>

        <!-- Mouth -->
        ${mouths}

        <!-- Blush -->
        ${m==='Happy' ? `<ellipse cx="60" cy="100" rx="12" ry="6" fill="${a}" opacity=".3"/>
        <ellipse cx="116" cy="100" rx="12" ry="6" fill="${a}" opacity=".3"/>` : ''}

        <!-- Stubby paws -->
        <ellipse cx="58" cy="185" rx="18" ry="12" fill="${c}"/>
        <ellipse cx="118" cy="185" rx="18" ry="12" fill="${c}"/>
        <ellipse cx="52" cy="187" rx="5" ry="4" fill="${a}" opacity=".5"/>
        <ellipse cx="58" cy="189" rx="5" ry="4" fill="${a}" opacity=".5"/>
        <ellipse cx="64" cy="187" rx="5" ry="4" fill="${a}" opacity=".5"/>
        <ellipse cx="112" cy="187" rx="5" ry="4" fill="${a}" opacity=".5"/>
        <ellipse cx="118" cy="189" rx="5" ry="4" fill="${a}" opacity=".5"/>
        <ellipse cx="124" cy="187" rx="5" ry="4" fill="${a}" opacity=".5"/>

        ${m==='Fatigued' ? `<text x="108" y="68" font-size="11" fill="#a5b4fc" font-weight="800" opacity=".8">z</text>
        <text x="120" y="55" font-size="15" fill="#a5b4fc" font-weight="800" opacity=".6">z</text>` : ''}
      </g>
    </svg>`;
  }

  if (arch === 'tiger') {
    return `<svg viewBox="0 0 176 200" xmlns="http://www.w3.org/2000/svg" class="pet-svg-face" width="140" height="160">
      <g class="${bodyClass}">
        <!-- Body with stripes -->
        <ellipse cx="88" cy="158" rx="40" ry="30" fill="${c}" opacity=".9"/>
        <!-- Body stripes -->
        <path d="M 70 138 Q 68 148 66 158" stroke="${a}" stroke-width="4" fill="none" opacity=".6"/>
        <path d="M 80 135 Q 79 148 78 162" stroke="${a}" stroke-width="3" fill="none" opacity=".5"/>
        <path d="M 96 135 Q 97 148 98 162" stroke="${a}" stroke-width="3" fill="none" opacity=".5"/>
        <path d="M 106 138 Q 108 148 110 158" stroke="${a}" stroke-width="4" fill="none" opacity=".6"/>

        <!-- Tail with rings -->
        <path class="pet-tail" style="animation:tailWag ${m==='Happy'?'0.7s':'1.8s'} ease-in-out infinite;transform-origin:118px 155px"
          d="M 118 155 Q 150 138 153 112 Q 156 96 144 100 Q 136 108 140 128 Q 143 145 118 148 Z" fill="${c}"/>
        <!-- Tail rings -->
        <path d="M 148 110 Q 152 116 150 122" stroke="${a}" stroke-width="4" fill="none" opacity=".7"/>
        <path d="M 144 124 Q 148 130 146 136" stroke="${a}" stroke-width="4" fill="none" opacity=".6"/>

        <!-- Head -->
        <ellipse cx="88" cy="90" rx="42" ry="40" fill="${c}"/>

        <!-- Head stripes -->
        <path d="M 68 70 Q 70 80 68 92" stroke="${a}" stroke-width="3.5" fill="none" opacity=".55"/>
        <path d="M 78 63 Q 80 76 79 90" stroke="${a}" stroke-width="2.5" fill="none" opacity=".45"/>
        <path d="M 98 63 Q 96 76 97 90" stroke="${a}" stroke-width="2.5" fill="none" opacity=".45"/>
        <path d="M 108 70 Q 106 80 108 92" stroke="${a}" stroke-width="3.5" fill="none" opacity=".55"/>
        <!-- Forehead M-stripe -->
        <path d="M 80 68 L 84 75 L 88 70 L 92 75 L 96 68" stroke="${a}" stroke-width="2.5" fill="none" opacity=".6"/>

        <!-- Ears (tiger ears are pointy-ish) -->
        <polygon class="pet-ear-left" style="animation:earTwitch ${m==='Happy'?'1.3s':'4s'} ease-in-out infinite;transform-origin:62px 58px"
          points="50,70 58,38 76,64" fill="${c}"/>
        <polygon points="54,67 60,44 73,63" fill="#fff" opacity=".4"/>
        <polygon points="56,65 60,48 72,62" fill="${a}" opacity=".5"/>
        <polygon class="pet-ear-right" style="animation:earTwitch ${m==='Happy'?'1.3s':'4s'} ease-in-out infinite .3s;transform-origin:114px 58px"
          points="126,70 118,38 100,64" fill="${c}"/>
        <polygon points="122,67 116,44 103,63" fill="#fff" opacity=".4"/>
        <polygon points="120,65 116,48 104,62" fill="${a}" opacity=".5"/>

        <!-- Eyes -->
        ${eyeSVG(73, 90)}
        ${eyeSVG(103, 90)}

        <!-- Nose + snout -->
        <ellipse cx="88" cy="106" rx="16" ry="12" fill="${c}" opacity=".8"/>
        <path d="M 84 102 L 88 98 L 92 102 Q 88 106 84 102 Z" fill="#1a0a00"/>
        <ellipse cx="86" cy="101" rx="2" ry="1.5" fill="white" opacity=".6"/>

        <!-- Whisker spots -->
        <circle cx="72" cy="106" r="2.5" fill="${a}" opacity=".5"/>
        <circle cx="68" cy="111" r="2" fill="${a}" opacity=".4"/>
        <circle cx="104" cy="106" r="2.5" fill="${a}" opacity=".5"/>
        <circle cx="108" cy="111" r="2" fill="${a}" opacity=".4"/>
        <!-- Whiskers -->
        <line x1="44" y1="103" x2="76" y2="104" stroke="#1a0a00" stroke-width="1.2" opacity=".5"/>
        <line x1="44" y1="109" x2="76" y2="108" stroke="#1a0a00" stroke-width="1.2" opacity=".4"/>
        <line x1="132" y1="103" x2="100" y2="104" stroke="#1a0a00" stroke-width="1.2" opacity=".5"/>
        <line x1="132" y1="109" x2="100" y2="108" stroke="#1a0a00" stroke-width="1.2" opacity=".4"/>

        <!-- Mouth -->
        ${mouths}

        <!-- Blush (only happy) -->
        ${m==='Happy' ? `<ellipse cx="62" cy="100" rx="9" ry="5" fill="${a}" opacity=".25"/>
        <ellipse cx="114" cy="100" rx="9" ry="5" fill="${a}" opacity=".25"/>` : ''}

        <!-- Paws -->
        <ellipse cx="66" cy="181" rx="14" ry="10" fill="${c}"/>
        <ellipse cx="110" cy="181" rx="14" ry="10" fill="${c}"/>
        <ellipse cx="61" cy="183" rx="4.5" ry="3.5" fill="${a}" opacity=".6"/>
        <ellipse cx="66" cy="185" rx="4.5" ry="3.5" fill="${a}" opacity=".6"/>
        <ellipse cx="71" cy="183" rx="4.5" ry="3.5" fill="${a}" opacity=".6"/>
        <ellipse cx="105" cy="183" rx="4.5" ry="3.5" fill="${a}" opacity=".6"/>
        <ellipse cx="110" cy="185" rx="4.5" ry="3.5" fill="${a}" opacity=".6"/>
        <ellipse cx="115" cy="183" rx="4.5" ry="3.5" fill="${a}" opacity=".6"/>

        ${m==='Fatigued' ? `<text x="108" y="68" font-size="11" fill="#a5b4fc" font-weight="800" opacity=".8">z</text>
        <text x="118" y="56" font-size="14" fill="#a5b4fc" font-weight="800" opacity=".6">z</text>` : ''}
      </g>
    </svg>`;
  }

  // Fallback: generic round animal
  return getPetSVG('cat', mood, color, accent);
}

// ─── Build the full pet panel scene div ──────────────────────────────────────
const _scenes = {};
const _tabs = {};

function destroyScene(containerId) {
  const sc = _scenes[containerId];
  if (!sc) return;
  delete _scenes[containerId];
}

function buildScene(containerId, archOverride, config, moodKey) {
  const m = MOOD[moodKey] || MOOD.Happy;
  destroyScene(containerId);

  const wrap = document.createElement('div');
  wrap.id = 'pet-scene-wrap-' + containerId;
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

  // Mood badge (no emoji — text only)
  const moodLabels = { Happy:'Happy', Okay:'Okay', Hungry:'Hungry', Fatigued:'Fatigued' };
  const moodIcons  = { Happy:'▲', Okay:'●', Hungry:'▼', Fatigued:'◑' };
  const badge = document.createElement('div');
  badge.style.cssText = `position:absolute;top:9px;right:9px;z-index:20;
    background:rgba(0,0,0,.65);backdrop-filter:blur(6px);border-radius:999px;
    padding:3px 10px;font-size:.65rem;font-weight:700;color:${m.color};
    border:1px solid ${m.glow};animation:moodPulse 2.5s ease-in-out infinite;`;
  badge.textContent = `${moodIcons[moodKey]||'●'} ${moodLabels[moodKey]||moodKey}`;
  wrap.appendChild(badge);

  // Sleep zzz
  if (moodKey === 'Fatigued') {
    [{top:'28%',left:'58%',delay:'0s'},{top:'18%',left:'68%',delay:'.9s'},{top:'12%',left:'54%',delay:'1.7s'}]
      .forEach(p => {
        const z = document.createElement('div');
        z.className='pet-zzz'; Object.assign(z.style,p); z.textContent='z'; wrap.appendChild(z);
      });
  }

  // SVG pet face — use passed archOverride first, then fall back to config lookup
  const arch = archOverride || Object.keys(PET_CONFIG).find(k => PET_CONFIG[k] === config) || 'cat';
  const unlockInfo = PET_UNLOCK_LEVELS[arch] || PET_UNLOCK_LEVELS.cat;
  const svgHtml = getPetSVG(arch, moodKey, unlockInfo.color, unlockInfo.accent);

  const svgWrap = document.createElement('div');
  svgWrap.className = 'pet-canvas-wrap bounce';
  svgWrap.style.cssText = `position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;`;
  svgWrap.innerHTML = svgHtml;
  wrap.appendChild(svgWrap);

  _scenes[containerId] = { _key: `${arch}-${moodKey}` };
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
  const equippedIds = eq || [];
  return [{id:'scholar_specs',name:'Scholar Specs',icon:'🤓',cost:120,bonus:'+2 XP/task'},
          {id:'cozy_scarf',   name:'Cozy Scarf',   icon:'🧣',cost:200,bonus:'-20% hunger'},
          {id:'focus_crown',  name:'Focus Crown',  icon:'👑',cost:500,bonus:'+5% XP'}]
  .map(w=>{
    const on = equippedIds.includes(w.id);
    return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:3px;
      background:var(--bg3);border-radius:10px;padding:.48rem .28rem;
      border:1px solid ${on?'var(--accent)':'var(--border)'};
      cursor:pointer;transition:transform .15s,box-shadow .15s"
      onclick="${on ? '' : `window.buyWardrobeItem('${w.id}')`}"
      onmouseover="this.style.transform='scale(1.08)';this.style.boxShadow='0 0 10px var(--accent)44'"
      onmouseout="this.style.transform='';this.style.boxShadow=''">
      <span style="font-size:1.4rem">${w.icon}</span>
      <span style="font-size:.6rem;font-weight:600;color:var(--text1)">${w.name}</span>
      <span style="font-size:.57rem;color:var(--text2)">${w.bonus}</span>
      <span style="font-size:.57rem;font-weight:700;color:${on?'var(--green)':'var(--amber)'}">${on?'✓ Equipped':'⚡'+w.cost}</span>
    </div>`;
  }).join('');
}

function petsHTML(curArchetype) {
  const xp = window.getXpState?.() || { level: 1 };
  const currentLevel = xp.level || 1;

  return Object.entries(PET_UNLOCK_LEVELS).map(([k, v]) => {
    const isActive = k === curArchetype;
    const isUnlocked = currentLevel >= v.minLevel;
    const isLocked = !isUnlocked;

    return `<div class="pet-unlock-card" style="display:flex;flex-direction:column;align-items:center;gap:4px;
      background:var(--bg3);border-radius:12px;padding:.55rem .3rem;
      border:2px solid ${isActive ? 'var(--accent)' : isLocked ? 'var(--border)' : '#ffffff22'};
      cursor:${isActive||isLocked ? 'default' : 'pointer'};
      transition:transform .15s,box-shadow .15s;
      opacity:${isLocked ? '0.55' : '1'};
      position:relative;overflow:hidden"
      ${(!isActive && !isLocked) ? `onclick="window._switchPetArchetype('${k}')"` : ''}
      ${!isLocked && !isActive ? `onmouseover="this.style.transform='scale(1.05)';this.style.boxShadow='0 0 12px var(--accent)44'" onmouseout="this.style.transform='';this.style.boxShadow=''"` : ''}>
      <!-- Mini SVG preview -->
      <div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:8px;background:${v.color}22;">
        ${isLocked
          ? `<div class="pet-lock-icon" style="font-size:1.3rem;color:var(--text3)">🔒</div>`
          : `<div style="transform:scale(0.55);transform-origin:center;width:80px;height:80px;margin:-18px">${getPetSVG(k, 'Happy', v.color, v.accent)}</div>`
        }
      </div>
      <span style="font-size:.58rem;font-weight:700;color:${isActive?'var(--accent)':'var(--text1)'};text-align:center;line-height:1.2">${v.name}</span>
      <span style="font-size:.52rem;color:${isLocked?'#ef444488':'var(--text3)'};text-align:center">
        ${isActive ? '✓ Active' : isLocked ? `Lv.${v.minLevel}+` : 'Switch'}
      </span>
    </div>`;
  }).join('');
}

window._switchPetArchetype = function(arch) {
  const pet = window.getPetState?.();
  if (!pet) return;
  const xp = window.getXpState?.() || { level: 1 };
  const info = PET_UNLOCK_LEVELS[arch];
  if (info && (xp.level||1) < info.minLevel) {
    window.showToast?.(`Reach Level ${info.minLevel} to unlock ${info.name}! 🔒`, 'info');
    return;
  }
  pet.archetype = arch;
  window.savePetState?.(pet);
  ['pet-card-content','pet-page-content'].forEach(id=>window.renderEnhancedPetCard?.(id));
};

// ─── Hatch panel with level-unlock pet selection ──────────────────────────────
function buildHatchPanel(containerId) {
  const xp = window.getXpState?.() || { level: 1 };
  const currentLevel = xp.level || 1;

  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div style="padding:.3rem 0;text-align:center">
      <div style="font-size:2.4rem;margin-bottom:.3rem;animation:petFloat 2s ease-in-out infinite">🥚</div>
      <div style="font-weight:700;font-size:.95rem;color:var(--text1)">Hatch Your Study Buddy</div>
      <div style="font-size:.72rem;color:var(--text2);margin:.12rem 0 .8rem">Pick a companion and name it</div>

      <!-- Pet selection grid -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.45rem;margin-bottom:.75rem">
        ${Object.entries(PET_UNLOCK_LEVELS).map(([k, v], i) => {
          const isUnlocked = currentLevel >= v.minLevel;
          const isFirst = i === 0;
          return `<label style="display:flex;flex-direction:column;align-items:center;gap:.3rem;
            padding:.5rem .25rem;border-radius:10px;
            border:2px solid ${isFirst?'var(--accent)':'var(--border)'};
            background:var(--bg3);cursor:${isUnlocked?'pointer':'not-allowed'};
            transition:border-color .15s;opacity:${isUnlocked?1:0.5}"
            id="pet-hatch-label-${k}-${containerId}"
            ${isUnlocked ? `onmouseover="this.style.borderColor='var(--accent)'"
            onmouseout="if(!this.querySelector('input').checked)this.style.borderColor='var(--border)'"` : ''}>
            <input type="radio" name="pet-archetype-${containerId}" value="${k}"
              ${isFirst?'checked':''} ${isUnlocked?'':'disabled'} style="display:none"
              onchange="document.querySelectorAll('[id^=pet-hatch-label-][id$=-${containerId}]').forEach(l=>{if(!l.querySelector('input').checked)l.style.borderColor='var(--border)'});this.closest('label').style.borderColor='var(--accent)'">
            <!-- Mini pet preview -->
            <div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;
              overflow:hidden;border-radius:8px;background:${v.color}22">
              ${isUnlocked
                ? `<div style="transform:scale(0.5);transform-origin:center;width:80px;height:80px;margin:-20px">${getPetSVG(k,'Happy',v.color,v.accent)}</div>`
                : `<div style="font-size:1.1rem">🔒</div>`
              }
            </div>
            <span style="font-size:.62rem;color:var(--text2);font-weight:600;line-height:1.2;text-align:center">${v.name}</span>
            <span style="font-size:.55rem;color:${isUnlocked?'var(--text3)':'#ef444488'}">
              ${isUnlocked ? (isFirst?'✓ Ready':'Available') : `Lv.${v.minLevel}+`}
            </span>
          </label>`;
        }).join('')}
      </div>

      <input type="text" id="pet-name-input-${containerId}" class="input"
        placeholder="Name your buddy…" style="width:100%;text-align:center;margin-bottom:.55rem;box-sizing:border-box">
      <button class="btn-primary" style="width:100%" id="hatch-btn-${containerId}">🥚 Hatch!</button>
    </div>`;

  // Attach hatch button after DOM insertion
  setTimeout(() => {
    const btn = document.getElementById('hatch-btn-' + containerId);
    if (btn) {
      btn.onclick = function() {
        const checked = document.querySelector(`input[name="pet-archetype-${containerId}"]:checked`);
        const archetype = checked ? checked.value : 'cat';
        const nameEl = document.getElementById('pet-name-input-' + containerId);
        const name = nameEl ? nameEl.value : '';
        if (window.hatchPet) {
          window.hatchPet(archetype, name);
        }
      };
    }
  }, 0);
}

// ─── Main render ──────────────────────────────────────────────────────────────
window.renderEnhancedPetCard = function(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!window.getPetState || !window.getPetHunger) {
    // App.js globals not ready yet — show spinner and retry
    container.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6rem;padding:1.5rem 0;color:var(--text3)">
      <div style="width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:loadSpin .7s linear infinite"></div>
      <span style="font-size:.75rem">Loading your buddy…</span>
    </div>`;
    let attempts = 0;
    const retry = setInterval(() => {
      attempts++;
      if (window.getPetState && window.getPetHunger) {
        clearInterval(retry);
        window.renderEnhancedPetCard(containerId);
      }
      if (attempts > 80) clearInterval(retry);
    }, 100);
    return;
  }

  const pet = window.getPetState();

  if (!pet) {
    destroyScene(containerId);
    buildHatchPanel(containerId);
    return;
  }

  const hunger  = window.getPetHunger(pet);
  const getMood = window.getPetMood || (h=>h>=80?{mood:'Happy',color:'#34d399'}:h>=50?{mood:'Okay',color:'#fbbf24'}:h>=20?{mood:'Hungry',color:'#f97316'}:{mood:'Fatigued',color:'#ef4444'});
  const { mood, color:moodColor } = getMood(hunger);

  // Normalise archetype: kitten → cat
  const arch = pet.archetype === 'kitten' ? 'cat' : (pet.archetype || 'cat');
  const config = PET_CONFIG[arch] || PET_CONFIG.cat;
  const unlockInfo = PET_UNLOCK_LEVELS[arch] || PET_UNLOCK_LEVELS.cat;
  const activeTab = _tabs[containerId] || 'food';

  // Only rebuild scene if mood/archetype changed
  const sceneKey = `${arch}-${mood}`;
  const needsNewScene = !_scenes[containerId] || _scenes[containerId]._key !== sceneKey;

  // Detach existing scene div BEFORE wiping innerHTML so it isn't destroyed
  const existingScene = document.getElementById('pet-scene-wrap-' + containerId);
  if (existingScene && !needsNewScene) existingScene.remove();

  container.innerHTML = '';

  // Name row
  const nr = document.createElement('div');
  nr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem';
  nr.innerHTML=`<div style="font-weight:700;font-size:.97rem;color:var(--text1)">${pet.name}</div>
    <div style="font-size:.68rem;color:var(--text3);font-style:italic">${unlockInfo.personality||config.personality}</div>`;
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

  // Scene (SVG pet)
  if (needsNewScene) {
    const sceneDiv = buildScene(containerId, arch, config, mood);
    container.appendChild(sceneDiv);
  } else {
    // Re-attach the detached scene div (was removed before innerHTML wipe)
    const detachedScene = existingScene || document.getElementById('pet-scene-wrap-' + containerId);
    if (detachedScene) container.appendChild(detachedScene);
    else {
      // Fallback: rebuild if somehow missing
      const sceneDiv = buildScene(containerId, arch, config, mood);
      container.appendChild(sceneDiv);
    }
  }

  // Dashboard card only shows pet — no tabs
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
    grid.style.cssText='display:grid;grid-template-columns:repeat(5,1fr);gap:.3rem';
    grid.innerHTML=petsHTML(arch);
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
    const sc=document.querySelector('#pet-card-content [style*="border-radius:16px"]')||document.querySelector('#pet-page-content [style*="border-radius:16px"]');
    if(sc)window._petSpawnHearts(sc);
    ['pet-card-content','pet-page-content'].forEach(id=>window.renderEnhancedPetCard?.(id));
  };
};

// ─── Init — app.js loads before pet.js (both type="module"), so globals are ready ─
(function initPetSystem() {
  if (typeof window.getPetState !== 'function') {
    // Fallback retry in case of unexpected load order
    let attempts = 0;
    const retry = setInterval(() => {
      attempts++;
      if (typeof window.getPetState === 'function') {
        clearInterval(retry);
        _bootPetSystem();
      }
      if (attempts > 60) clearInterval(retry);
    }, 100);
    return;
  }
  _bootPetSystem();
})();

function _bootPetSystem() {
  window.installEnhancedFeedPet?.();
  // Render dashboard pet card
  setTimeout(() => {
    window.renderEnhancedPetCard?.('pet-card-content');
  }, 50);
  // Signal to app.js that pet system is ready
  window._petSystemReady = true;
  window.dispatchEvent(new CustomEvent('petSystemReady'));
}
