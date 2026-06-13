/**
 * AGVHud.js — Overlay HUD telemetry AGV di atas world XORA
 * Neon light blue theme, SVG icons, clean layout
 */
import { Game } from '../Game.js'

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const ICONS = {
    station: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" fill="currentColor"/>
    </svg>`,
    home: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1.5L1.5 7h2v6.5h3V10h3v3.5h3V7h2L8 1.5z" fill="currentColor"/>
        <path d="M8 3.2L3 7.5v5.5h2V9.5h6v3.5h2V7.5L8 3.2z" fill="currentColor" opacity="0.4"/>
    </svg>`,
    robot: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="6" width="12" height="9" rx="2" stroke="currentColor" stroke-width="1.5"/>
        <circle cx="6.5" cy="10" r="1.2" fill="currentColor"/>
        <circle cx="11.5" cy="10" r="1.2" fill="currentColor"/>
        <path d="M7 13h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M9 6V3.5M6 3.5h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="9" cy="2.5" r="1" fill="currentColor"/>
    </svg>`,
    motor: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/>
        <path d="M7 3.5v4l2.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`,
    distance: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 12L12 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M2 12h3M9 2v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`,
    weight: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 10h6l1-4H3l1 4z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M5.5 6L7 2l1.5 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M3 10v1.5h8V10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`,
    battery: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="4" width="10" height="6" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
        <path d="M11 6h1.5v2H11" stroke="currentColor" stroke-width="1.2"/>
        <rect x="2.5" y="5.5" width="5" height="3" rx="0.5" fill="currentColor" opacity="0.6"/>
    </svg>`,
    auto: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/>
        <path d="M5 7l1.5 1.5L9 5.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    manual: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 2v4M4.5 6L7 8.5 9.5 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M3 10h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <rect x="4" y="9" width="6" height="3" rx="1" stroke="currentColor" stroke-width="1.2"/>
    </svg>`,
    online: `<svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="4" cy="4" r="3" fill="currentColor"/>
        <circle cx="4" cy="4" r="3" fill="currentColor" opacity="0.4">
            <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite"/>
        </circle>
    </svg>`,
}

export class AGVHud
{
    constructor()
    {
        this.game = Game.getInstance()
        this.agvState = this.game.agvState
        this._buildDOM()
        this._bindEvents()
    }

    _buildDOM()
    {
        const hud = document.createElement('div')
        hud.id = 'agv-hud'
        hud.innerHTML = `
        <style>
            :root {
                --neon: #00d4ff;
                --neon-dim: #0099bb;
                --neon-glow: rgba(0, 212, 255, 0.25);
                --neon-bg: rgba(6, 12, 24, 0.88);
                --neon-border: rgba(0, 212, 255, 0.3);
            }

            #agv-hud {
                position: fixed; inset: 0;
                pointer-events: none;
                font-family: 'JetBrains Mono', 'Courier New', monospace;
                z-index: 100;
            }

            /* ── Status Card (top-left) ── */
            #agv-status {
                position: absolute; top: 16px; left: 16px;
                background: var(--neon-bg);
                border: 1px solid var(--neon-border);
                backdrop-filter: blur(12px);
                border-radius: 8px;
                padding: 12px 16px;
                color: #b0d4e8;
                font-size: 11px;
                line-height: 1.8;
                pointer-events: all;
                min-width: 190px;
                box-shadow: 0 0 20px rgba(0, 212, 255, 0.06);
            }

            #hud-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 6px;
                padding-bottom: 6px;
                border-bottom: 1px solid rgba(0, 212, 255, 0.12);
            }

            #hud-header .hud-icon {
                color: var(--neon);
                display: flex;
                align-items: center;
            }

            #hud-state-badge {
                font-size: 12px;
                font-weight: 700;
                color: var(--neon);
                letter-spacing: 1.5px;
                text-transform: uppercase;
            }

            .hud-status-dot {
                color: var(--neon);
                display: flex;
                align-items: center;
                margin-left: auto;
            }

            .hud-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                padding: 1px 0;
            }

            .hud-label {
                color: #4a6a7a;
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                display: flex;
                align-items: center;
                gap: 5px;
            }

            .hud-label .hud-icon {
                color: #3a5a6a;
                display: flex;
                align-items: center;
            }

            .hud-val {
                color: var(--neon);
                font-weight: 600;
                font-size: 11px;
            }

            /* ── Command Bar (bottom-center) ── */
            #agv-cmd {
                position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
                display: flex; gap: 6px;
                pointer-events: all;
            }

            .hud-btn {
                background: var(--neon-bg);
                border: 1px solid var(--neon-border);
                color: #8ab4c8;
                padding: 8px 14px;
                border-radius: 6px;
                cursor: pointer;
                font-family: 'JetBrains Mono', 'Courier New', monospace;
                font-size: 11px;
                font-weight: 600;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 6px;
                letter-spacing: 0.3px;
            }

            .hud-btn:hover {
                background: rgba(0, 212, 255, 0.1);
                border-color: var(--neon);
                color: var(--neon);
                box-shadow: 0 0 12px var(--neon-glow);
            }

            .hud-btn .btn-icon {
                color: var(--neon-dim);
                display: flex;
                align-items: center;
                transition: color 0.2s;
            }

            .hud-btn:hover .btn-icon {
                color: var(--neon);
            }

            /* Station colors */
            .hud-btn[data-station="A"] .btn-icon { color: #00cc66; }
            .hud-btn[data-station="A"]:hover .btn-icon { color: #00ff88; }
            .hud-btn[data-station="A"]:hover { border-color: rgba(0, 204, 102, 0.5); color: #00cc66; }

            .hud-btn[data-station="B"] .btn-icon { color: #ffaa00; }
            .hud-btn[data-station="B"]:hover .btn-icon { color: #ffcc44; }
            .hud-btn[data-station="B"]:hover { border-color: rgba(255, 170, 0, 0.5); color: #ffaa00; }

            .hud-btn[data-station="C"] .btn-icon { color: #ff4466; }
            .hud-btn[data-station="C"]:hover .btn-icon { color: #ff6688; }
            .hud-btn[data-station="C"]:hover { border-color: rgba(255, 68, 102, 0.5); color: #ff4466; }

            .hud-btn[data-action="return"] .btn-icon { color: var(--neon-dim); }
            .hud-btn[data-action="return"]:hover { border-color: var(--neon); color: var(--neon); }

            /* ── Mode Toggle (bottom-left) ── */
            #agv-mode {
                position: absolute; bottom: 20px; left: 16px;
                display: flex; gap: 4px;
                pointer-events: all;
                background: var(--neon-bg);
                border: 1px solid var(--neon-border);
                border-radius: 6px;
                padding: 3px;
            }

            .hud-mode-btn {
                background: transparent;
                border: 1px solid transparent;
                color: #4a6a7a;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-family: 'JetBrains Mono', 'Courier New', monospace;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 1px;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 5px;
            }

            .hud-mode-btn:hover {
                color: #8ab4c8;
            }

            .hud-mode-btn.active {
                background: rgba(0, 212, 255, 0.12);
                border-color: var(--neon-border);
                color: var(--neon);
                box-shadow: 0 0 8px var(--neon-glow);
            }

            .hud-mode-btn .mode-icon {
                display: flex;
                align-items: center;
            }
        </style>

        <!-- Status Card -->
        <div id="agv-status">
            <div id="hud-header">
                <span class="hud-icon">${ICONS.robot}</span>
                <span id="hud-state-badge">IDLE</span>
                <span class="hud-status-dot">${ICONS.online}</span>
            </div>
            <div class="hud-row">
                <span class="hud-label"><span class="hud-icon">${ICONS.station}</span>Dest</span>
                <span class="hud-val" id="hud-dest">BASE</span>
            </div>
            <div class="hud-row">
                <span class="hud-label"><span class="hud-icon">${ICONS.motor}</span>Motor</span>
                <span class="hud-val" id="hud-motor">0 / 0</span>
            </div>
            <div class="hud-row">
                <span class="hud-label"><span class="hud-icon">${ICONS.weight}</span>Load</span>
                <span class="hud-val" id="hud-load">0 g</span>
            </div>
            <div class="hud-row">
                <span class="hud-label"><span class="hud-icon">${ICONS.distance}</span>Dist</span>
                <span class="hud-val" id="hud-dist">0 cm</span>
            </div>
            <div class="hud-row">
                <span class="hud-label"><span class="hud-icon">${ICONS.battery}</span>Batt</span>
                <span class="hud-val" id="hud-batt">100%</span>
            </div>
        </div>

        <!-- Command Bar -->
        <div id="agv-cmd">
            <button class="hud-btn" data-station="A" id="btn-a">
                <span class="btn-icon">${ICONS.station}</span>STN A
            </button>
            <button class="hud-btn" data-station="B" id="btn-b">
                <span class="btn-icon">${ICONS.station}</span>STN B
            </button>
            <button class="hud-btn" data-station="C" id="btn-c">
                <span class="btn-icon">${ICONS.station}</span>STN C
            </button>
            <button class="hud-btn" data-action="return" id="btn-return">
                <span class="btn-icon">${ICONS.home}</span>BASE
            </button>
        </div>

        <!-- Mode Toggle -->
        <div id="agv-mode">
            <button class="hud-mode-btn active" id="btn-auto">
                <span class="mode-icon">${ICONS.auto}</span>AUTO
            </button>
            <button class="hud-mode-btn" id="btn-manual">
                <span class="mode-icon">${ICONS.manual}</span>MANUAL
            </button>
        </div>
        `
        document.body.appendChild(hud)
    }

    _bindEvents()
    {
        this.agvState.events.on('update', (s) => this._refresh(s))

        const $ = (id) => document.getElementById(id)
        $('btn-a')?.addEventListener('click', () => this.game.server.sendCommand('GOTO_A'))
        $('btn-b')?.addEventListener('click', () => this.game.server.sendCommand('GOTO_B'))
        $('btn-c')?.addEventListener('click', () => this.game.server.sendCommand('GOTO_C'))
        $('btn-return')?.addEventListener('click', () => this.game.server.sendCommand('RETURN'))

        $('btn-auto')?.addEventListener('click', () => {
            this.game.server.sendCommand('SET_MODE_AUTO')
            $('btn-auto').classList.add('active')
            $('btn-manual').classList.remove('active')
        })
        $('btn-manual')?.addEventListener('click', () => {
            this.game.server.sendCommand('SET_MODE_MANUAL')
            $('btn-manual').classList.add('active')
            $('btn-auto').classList.remove('active')
        })
    }

    _refresh(s)
    {
        const set = (id, val) => {
            const el = document.getElementById(id)
            if(el) el.textContent = val
        }
        set('hud-state-badge', s.state)
        set('hud-dest', s.destination)
        set('hud-motor', `${Math.round(s.motorLeft)} / ${Math.round(s.motorRight)}`)
        set('hud-load', `${Math.round(s.loadcellG)} g`)
        set('hud-dist', `${Math.round(s.distanceCm)} cm`)
        set('hud-batt', `${Math.round(s.battery)}%`)
    }
}
