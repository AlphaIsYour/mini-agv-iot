import * as THREE from 'three/webgpu'

const text = `
██╗  ██╗ ██████╗ ██████╗  █████╗
╚╚██╗██╔╝██╔═══██╗██╔══██╗██╔══██╗
 ╚███╔╝ ██║   ██║██████╔╝███████║
 ██╔██╗ ██║   ██║██╔══██╗██╔══██║
██╔╝ ██╗╚██████╔╝██║  ██║██║  ██║
╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝

╔═ AGV IoT Dashboard ══════════════╗
║ XORA — Automated Guided Vehicle
║ 3D Digital Twin + Real-time Telemetry
╚═══════════════════════════════════╝

╔═ Tech Stack ═════════════════════╗
║ Three.js (release: ${THREE.REVISION})  ⇒ https://threejs.org/
║ Rapier (Physics)               ⇒ https://rapier.rs/
║ Express + WebSocket + MQTT     ⇒ Backend
║ NeonDB                         ⇒ Database
╚═══════════════════════════════════╝

╔═ Debug ══════════════════════════╗
║ Add #debug at the end of the URL
║ Press [V] to toggle the free camera
╚═══════════════════════════════════╝
`
let finalText = ''
let finalStyles = []
const stylesSet = {
    letter: 'color: #00d4ff; font: 400 1em monospace;',
    pipe: 'color: #D66FFF; font: 400 1em monospace;',
}
let currentStyle = null
for(let i = 0; i < text.length; i++)
{
    const char = text[i]

    const style = char.match(/[╔║═╗╚╝╔╝]/) ? 'pipe' : 'letter'
    if(style !== currentStyle)
    {
        currentStyle = style
        finalText += '%c'

        finalStyles.push(stylesSet[currentStyle])
    }
    finalText += char
}

export default [finalText, ...finalStyles]
