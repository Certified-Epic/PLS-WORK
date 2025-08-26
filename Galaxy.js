// Galaxy.js
// OGL + GSAP animated galaxy background
// Usage (vanilla):
//   import Galaxy from './Galaxy.js';
//   const galaxy = new Galaxy(document.getElementById('galaxy-bg'), { density: 1.2 });
//   galaxy.start();

import { Renderer, Camera, Transform, Program, Mesh, Geometry } from 'ogl';
import { gsap } from 'gsap';

export default class Galaxy {
  constructor(container, props = {}) {
    this.container = container;
    this.props = Object.assign({
      mouseRepulsion: true,
      mouseInteraction: true,
      density: 1.0,
      glowIntensity: 0.35,
      saturation: 0.9,
      hueShift: 210,
    }, props);

    this._init();
  }

  _init() {
    this.renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 2), alpha: true, antialias: true });
    this.gl = this.renderer.gl;
    this.gl.canvas.style.position = 'absolute';
    this.gl.canvas.style.inset = '0';
    this.gl.canvas.style.width = '100%';
    this.gl.canvas.style.height = '100%';
    this.gl.canvas.style.pointerEvents = 'none';
    this.container.appendChild(this.gl.canvas);

    this.camera = new Camera(this.gl, { fov: 45 });
    this.camera.position.set(0, 0, 12);

    this.scene = new Transform();

    const { positions, colors } = this._generatePoints();

    const geometry = new Geometry(this.gl, {
      position: { size: 3, data: positions },
      color: { size: 3, data: colors },
    });

    this.uniforms = {
      uTime: { value: 0 },
      uGlow: { value: this.props.glowIntensity },
      uHue: { value: this.props.hueShift / 360 },
      uSaturation: { value: this.props.saturation },
      uMouse: { value: [0, 0] },
      uRepel: { value: this.props.mouseRepulsion ? 1 : 0 },
    };

    const vertex = `
      attribute vec3 position;
      attribute vec3 color;
      uniform float uTime;
      uniform vec2 uMouse;
      uniform float uRepel;
      varying vec3 vColor;
      void main() {
        vec3 p = position;
        // subtle spiral motion
        float r = length(p.xy);
        float a = atan(p.y, p.x) + 0.05 * sin(uTime * 0.2 + r * 2.0);
        p.x = cos(a) * r;
        p.y = sin(a) * r;
        // mouse repulsion in clip-like space
        vec2 m = vec2(uMouse.x, uMouse.y);
        float d = distance(p.xy, m);
        float f = uRepel * smoothstep(1.2, 0.0, d) * 0.35;
        p.xy += normalize(p.xy - m) * f;
        vColor = color;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        gl_PointSize = 1.5 + 1.5 * smoothstep(0.0, 6.0, 12.0 - length(p));
      }
    `;

    const fragment = `
      precision highp float;
      uniform float uGlow;
      uniform float uHue;
      uniform float uSaturation;
      varying vec3 vColor;

      // HSV to RGB
      vec3 hsv2rgb(vec3 c) {
        vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        rgb = rgb * rgb * (3.0 - 2.0 * rgb);
        return c.z * mix(vec3(1.0), rgb, c.y);
      }

      void main() {
        // soft round point
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        float d = dot(uv, uv);
        float alpha = smoothstep(1.0, 0.0, d);
        vec3 base = hsv2rgb(vec3(uHue, uSaturation, 1.0)) * vColor;
        // glow falloff
        float glow = pow(1.0 - d, 2.0) * uGlow;
        vec3 col = base + glow;
        gl_FragColor = vec4(col, alpha * (0.7 + uGlow * 0.3));
      }
    `;

    const program = new Program(this.gl, { vertex, fragment, transparent: true, depthTest: false, uniforms: this.uniforms });
    this.points = new Mesh(this.gl, { mode: this.gl.POINTS, geometry, program });
    this.points.setParent(this.scene);

    this._onResize = this._onResize.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    window.addEventListener('resize', this._onResize);
    if (this.props.mouseInteraction) window.addEventListener('mousemove', this._onMouseMove);
    this._onResize();
  }

  _generatePoints() {
    const count = Math.floor(8000 * this.props.density);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const arm = i % 4;
      const armAngle = (arm / 4) * Math.PI * 2;
      const r = Math.random() * 6.0;
      const angle = armAngle + r * 0.35 + (Math.random() - 0.5) * 0.3;
      const x = Math.cos(angle) * r + (Math.random() - 0.5) * 0.2;
      const y = Math.sin(angle) * r + (Math.random() - 0.5) * 0.2;
      const z = (Math.random() - 0.5) * 0.6;

      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const tint = 0.6 + Math.random() * 0.4;
      colors[i * 3 + 0] = tint;
      colors[i * 3 + 1] = tint;
      colors[i * 3 + 2] = tint;
    }

    return { positions, colors };
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.perspective({ aspect: w / Math.max(h, 1) });
  }

  _onMouseMove(e) {
    const rect = this.container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    this.uniforms.uMouse.value[0] = x * 4.0; // scale to world-ish units
    this.uniforms.uMouse.value[1] = y * 2.5;
  }

  start() {
    if (this._raf) return;
    this._tick = () => {
      this.uniforms.uTime.value += 0.016;
      this.renderer.render({ scene: this.scene, camera: this.camera });
      this._raf = requestAnimationFrame(this._tick);
    };
    // subtle breathing animation using GSAP
    gsap.to(this.uniforms.uGlow, { value: this.props.glowIntensity * 1.4, duration: 3, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this._tick();
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext?.();
    this.container.innerHTML = '';
  }
}