/* heroFoodCard.js — Narrator card on the hero splash
 *
 * Game-card style panel cycling through Ojibwe cultural narrators.
 * No Three.js — pure CSS/SVG avatar display.
 *
 * Public API:
 *   HeroFoodCard.mount()
 *   HeroFoodCard.unmount()
 */
'use strict';

const HeroFoodCard = (() => {
  let _card    = null;
  let _mounted = false;
  let _idx     = 0;
  let _autoTimer = null;

  const NARRATORS = [
    {
      role:   'Elder · Storyteller',
      name:   'Nokomis',
      ojibwe: 'Grandmother of the forest',
      desc:   'Keeper of planting cycles and seed memory.',
      icon:   `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="28" r="16" fill="#5C3A1A" opacity=".9"/>
        <ellipse cx="40" cy="62" rx="22" ry="16" fill="#5C3A1A" opacity=".8"/>
        <path d="M24 28 Q28 14 40 14 Q52 14 56 28" stroke="#C8813A" stroke-width="2" fill="none"/>
        <circle cx="34" cy="27" r="2.5" fill="#F5E8CC"/>
        <circle cx="46" cy="27" r="2.5" fill="#F5E8CC"/>
        <path d="M35 34 Q40 38 45 34" stroke="#F5E8CC" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <path d="M20 22 Q16 18 20 14" stroke="#C8813A" stroke-width="1.5" fill="none"/>
        <path d="M60 22 Q64 18 60 14" stroke="#C8813A" stroke-width="1.5" fill="none"/>
      </svg>`,
      accent: '#C8813A',
    },
    {
      role:   'Hunter · Land Guide',
      name:   'Makwa',
      ojibwe: 'He who walks with bear',
      desc:   'Reads seasons through animal movements and plant signs.',
      icon:   `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="26" r="15" fill="#3A2210" opacity=".95"/>
        <ellipse cx="40" cy="60" rx="20" ry="15" fill="#3A2210" opacity=".85"/>
        <rect x="30" y="14" width="20" height="8" rx="4" fill="#2A1808"/>
        <circle cx="34" cy="26" r="2.5" fill="#F5E8CC"/>
        <circle cx="46" cy="26" r="2.5" fill="#F5E8CC"/>
        <path d="M36 33 Q40 36 44 33" stroke="#C8813A" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <line x1="26" y1="50" x2="54" y2="50" stroke="#C8813A" stroke-width="1" opacity=".5"/>
        <path d="M34 54 L40 48 L46 54" stroke="#F5D080" stroke-width="1.5" fill="none"/>
      </svg>`,
      accent: '#8B5E2A',
    },
    {
      role:   'Healer · Plant Keeper',
      name:   'Mashkiki-kwe',
      ojibwe: 'Medicine woman',
      desc:   'Knows which roots heal and which seasons they speak.',
      icon:   `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="26" r="15" fill="#4A3020" opacity=".9"/>
        <ellipse cx="40" cy="62" rx="21" ry="15" fill="#4A3020" opacity=".8"/>
        <path d="M25 26 Q22 10 40 12 Q58 10 55 26" fill="#2A1808"/>
        <circle cx="34" cy="26" r="2.5" fill="#F5E8CC"/>
        <circle cx="46" cy="26" r="2.5" fill="#F5E8CC"/>
        <path d="M36 33 Q40 37 44 33" stroke="#C8813A" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <circle cx="40" cy="54" r="5" fill="none" stroke="#C8813A" stroke-width="1.5"/>
        <line x1="40" y1="49" x2="40" y2="59" stroke="#C8813A" stroke-width="1"/>
        <line x1="35" y1="54" x2="45" y2="54" stroke="#C8813A" stroke-width="1"/>
      </svg>`,
      accent: '#7A9A50',
    },
    {
      role:   'Youth · Seed Learner',
      name:   'Binaakwe',
      ojibwe: 'One who tends with care',
      desc:   'Bridges ancestral knowledge with today\'s kitchens.',
      icon:   `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="27" r="14" fill="#6B4020" opacity=".9"/>
        <ellipse cx="40" cy="61" rx="19" ry="14" fill="#6B4020" opacity=".8"/>
        <circle cx="34" cy="27" r="2.5" fill="#F5E8CC"/>
        <circle cx="46" cy="27" r="2.5" fill="#F5E8CC"/>
        <path d="M36 34 Q40 38 44 34" stroke="#C8813A" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <path d="M28 20 Q32 10 40 12 Q48 10 52 20" fill="#4A2810"/>
        <path d="M38 50 Q40 44 42 50 Q44 56 40 58 Q36 56 38 50Z" fill="#C8813A" opacity=".6"/>
      </svg>`,
      accent: '#C8813A',
    },
    {
      role:   'Spirit · Dream Walker',
      name:   'Ajijaak',
      ojibwe: 'Crane — messenger between worlds',
      desc:   'Carries the old names of foods across generations.',
      icon:   `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="26" r="14" fill="#2A1E3A" opacity=".95"/>
        <ellipse cx="40" cy="61" rx="20" ry="14" fill="#2A1E3A" opacity=".85"/>
        <circle cx="34" cy="26" r="2.5" fill="#D0C0FF"/>
        <circle cx="46" cy="26" r="2.5" fill="#D0C0FF"/>
        <path d="M36 33 Q40 37 44 33" stroke="#A080E0" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <path d="M24 16 Q28 8 32 14" stroke="#A080E0" stroke-width="1.5" fill="none" opacity=".7"/>
        <path d="M56 16 Q52 8 48 14" stroke="#A080E0" stroke-width="1.5" fill="none" opacity=".7"/>
        <circle cx="40" cy="10" r="3" fill="#A080E0" opacity=".5"/>
      </svg>`,
      accent: '#9070D0',
    },
  ];

  // ── Build card DOM ──────────────────────────────────────────────────────────
  function _buildCard(splash) {
    const card = document.createElement('div');
    card.id = 'hero-food-card';
    card.innerHTML = _renderCard(_idx);
    splash.appendChild(card);
    _card = card;

    _attachEvents();

    // Auto-cycle every 4 seconds
    _autoTimer = setInterval(() => _goTo((_idx + 1) % NARRATORS.length), 4000);
  }

  function _renderCard(i) {
    const n = NARRATORS[i];
    const dots = NARRATORS.map((_, j) =>
      `<span class="hfc-dot${j === i ? ' hfc-dot--active' : ''}" data-i="${j}"></span>`
    ).join('');

    return `
      <div class="hfc-border" style="--accent:${n.accent}">
        <div class="hfc-inner">
          <div class="hfc-glow"></div>
          <div class="hfc-avatar">${n.icon}</div>
          <div class="hfc-badge">${n.role}</div>
          <div class="hfc-body">
            <p class="hfc-ojibwe" id="hfc-ojibwe">${n.ojibwe}</p>
            <h3 class="hfc-en" id="hfc-en">${n.name}</h3>
            <p class="hfc-desc">${n.desc}</p>
          </div>
          <div class="hfc-dots">${dots}</div>
          <button class="hfc-btn" id="hfc-next">Next guide →</button>
        </div>
      </div>
    `;
  }

  function _goTo(i) {
    _idx = i;
    if (!_card) return;
    const border = _card.querySelector('.hfc-border');
    const rx = border ? border.style.getPropertyValue('--rx') : '0deg';
    const ry = border ? border.style.getPropertyValue('--ry') : '0deg';

    _card.innerHTML = _renderCard(_idx);
    _attachEvents();

    const newBorder = _card.querySelector('.hfc-border');
    if (newBorder) {
      newBorder.style.setProperty('--rx', rx);
      newBorder.style.setProperty('--ry', ry);
    }
  }

  function _attachEvents() {
    const border = _card.querySelector('.hfc-border');

    _card.addEventListener('mousemove', (e) => {
      const r    = _card.getBoundingClientRect();
      const xPct = (e.clientX - r.left) / r.width  - 0.5;
      const yPct = (e.clientY - r.top)  / r.height - 0.5;
      border.style.setProperty('--rx', `${(-yPct * 16).toFixed(2)}deg`);
      border.style.setProperty('--ry', `${( xPct * 16).toFixed(2)}deg`);
    });
    _card.addEventListener('mouseleave', () => {
      border.style.setProperty('--rx', '0deg');
      border.style.setProperty('--ry', '0deg');
    });

    document.getElementById('hfc-next').addEventListener('click', () => {
      clearInterval(_autoTimer);
      _goTo((_idx + 1) % NARRATORS.length);
      _autoTimer = setInterval(() => _goTo((_idx + 1) % NARRATORS.length), 4000);
    });

    _card.querySelectorAll('.hfc-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        clearInterval(_autoTimer);
        _goTo(parseInt(dot.dataset.i));
        _autoTimer = setInterval(() => _goTo((_idx + 1) % NARRATORS.length), 4000);
      });
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  function mount() {
    if (_mounted) return;
    const splash = document.querySelector('.screen-splash');
    if (!splash) return;
    _buildCard(splash);
    _mounted = true;
  }

  function unmount() {
    clearInterval(_autoTimer);
    if (_card) { _card.remove(); _card = null; }
    _mounted = false;
    _idx = 0;
  }

  return { mount, unmount };
})();

window.HeroFoodCard = HeroFoodCard;
