"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./wolf.module.css";

const modes = ["Assemble", "Breathe", "Disperse"];
const vertex = `
attribute vec3 position;
attribute vec3 color;
attribute vec3 scatter;
attribute float seed;
uniform float time;
uniform float mode;
uniform float aspect;
uniform float pixelRatio;
uniform vec2 pointer;
varying vec3 tint;
varying float opacity;
void main() {
  float dispersed = smoothstep(1.0, 2.0, mode);
  float breathing = min(mode, 1.0) * (1.0 - dispersed);
  vec3 p = mix(position, scatter, dispersed);
  p.z += sin(time * 0.7 + seed * 12.0) * 0.065 * breathing;
  p.xy *= 1.0 + sin(time * 0.85) * 0.016 * breathing;
  vec2 delta = p.xy - pointer;
  float distance = length(delta);
  p.xy += normalize(delta + vec2(0.0001)) * exp(-distance * distance * 28.0) * 0.055;
  float yaw = sin(time * 0.25) * 0.1 + (abs(pointer.x) < 3.0 ? pointer.x * 0.14 : 0.0);
  float pitch = abs(pointer.y) < 3.0 ? pointer.y * 0.09 : 0.0;
  p.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * p.xz;
  p.yz = mat2(cos(pitch), -sin(pitch), sin(pitch), cos(pitch)) * p.yz;
  float perspective = 2.8 / (2.8 - p.z);
  vec2 scale = aspect > 1.0 ? vec2(0.9 / aspect, 0.9) : vec2(0.9, 0.9 * aspect);
  gl_Position = vec4(p.xy * scale * perspective, 0.0, 1.0);
  gl_PointSize = (1.25 + seed * 0.75) * pixelRatio * perspective;
  tint = color;
  opacity = (0.62 + seed * 0.38) * (1.0 - dispersed * 0.22);
}`;
const fragment = `
precision mediump float;
varying vec3 tint;
varying float opacity;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float alpha = (1.0 - smoothstep(0.18, 0.5, r)) * opacity;
  gl_FragColor = vec4(tint, alpha);
}`;

export default function WolfPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controls = useRef({ mode: 1, paused: false });
  const [mode, setMode] = useState(1);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => { controls.current = { mode, paused }; }, [mode, paused]);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.current.paused = reduced;
    setPaused(reduced);
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, powerPreference: "low-power" });
    if (!gl) { setFailed(true); return; }
    let disposed = false;
    let frame = 0;
    let elapsed = 0;
    let last = 0;
    let currentMode = 1;
    let visible = true;
    const shaders: WebGLShader[] = [];
    const buffers: WebGLBuffer[] = [];
    const program = gl.createProgram()!;
    const pointer = { x: 10, y: 10 };
    function compile(type: number, source: string) {
      const shader = gl!.createShader(type)!;
      shaders.push(shader);
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) throw new Error("Shader unavailable");
      gl!.attachShader(program, shader);
    }
    const onLost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); setReady(false); setFailed(true); };
    canvas.addEventListener("webglcontextlost", onLost);
    const image = new Image();
    image.src = "/brand/the-powerful-man-wolf.png";
    image.onerror = () => { if (!disposed) setFailed(true); };
    image.onload = () => {
      if (disposed) return;
      try {
        compile(gl.VERTEX_SHADER, vertex);
        compile(gl.FRAGMENT_SHADER, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Renderer unavailable");
        gl.useProgram(program);
        const sample = document.createElement("canvas");
        sample.width = 260; sample.height = 278;
        const ctx = sample.getContext("2d")!;
        ctx.drawImage(image, 0, 0, sample.width, sample.height);
        const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
        const positions: number[] = [], colors: number[] = [], scattered: number[] = [], seeds: number[] = [];
        for (let y = 0; y < sample.height; y++) for (let x = 0; x < sample.width; x++) {
          const i = (y * sample.width + x) * 4;
          if (pixels[i + 3] < 100) continue;
          const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
          const light = Math.max(r, g, b);
          // Retain the silhouette without letting black ink disappear against the stage.
          if (light < 0.12 && (x + y) % 3 !== 0) continue;
          const seed = ((x * 127 + y * 311) % 997) / 997;
          const px = (x / sample.width - 0.5) * 1.7;
          const py = (0.5 - y / sample.height) * 1.82;
          positions.push(px, py, light * 0.16 + Math.sin(x * 0.07) * Math.cos(y * 0.05) * 0.065);
          colors.push(Math.max(r, 0.16), Math.max(g, 0.14), Math.max(b, 0.12));
          const angle = seed * Math.PI * 2 + y * 0.12;
          const radius = 0.3 + ((x * 43 + y * 71) % 991) / 991 * 1.2;
          scattered.push(Math.cos(angle) * radius, Math.sin(angle) * radius, Math.sin(seed * 43) * 0.65);
          seeds.push(seed);
        }
        function attribute(name: string, values: number[], size: number) {
          const buffer = gl!.createBuffer()!; buffers.push(buffer);
          gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
          gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(values), gl!.STATIC_DRAW);
          const location = gl!.getAttribLocation(program, name);
          gl!.enableVertexAttribArray(location);
          gl!.vertexAttribPointer(location, size, gl!.FLOAT, false, 0, 0);
        }
        attribute("position", positions, 3); attribute("color", colors, 3);
        attribute("scatter", scattered, 3); attribute("seed", seeds, 1);
        const uniforms = Object.fromEntries(["time", "mode", "aspect", "pixelRatio", "pointer"].map(name => [name, gl.getUniformLocation(program, name)]));
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        setReady(true);
        const render = (now: number) => {
          if (disposed) return;
          const dt = last ? Math.min((now - last) / 1000, 0.05) : 0; last = now;
          if (visible && !document.hidden) {
            if (!controls.current.paused) elapsed += dt;
            currentMode += (controls.current.mode - currentMode) * (1 - Math.exp(-dt * 3.5));
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            const width = Math.round(canvas.clientWidth * ratio), height = Math.round(canvas.clientHeight * ratio);
            if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
            gl.viewport(0, 0, width, height); gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniform1f(uniforms.time, elapsed); gl.uniform1f(uniforms.mode, currentMode);
            gl.uniform1f(uniforms.aspect, width / height); gl.uniform1f(uniforms.pixelRatio, ratio);
            gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
            gl.drawArrays(gl.POINTS, 0, seeds.length);
          }
          frame = requestAnimationFrame(render);
        };
        frame = requestAnimationFrame(render);
      } catch { setFailed(true); }
    };
    const move = (event: PointerEvent) => {
      if (controls.current.paused) return;
      const rect = canvas.getBoundingClientRect(), aspect = rect.width / rect.height;
      pointer.x = ((event.clientX - rect.left) / rect.width * 2 - 1) / (aspect > 1 ? 0.9 / aspect : 0.9);
      pointer.y = (1 - (event.clientY - rect.top) / rect.height * 2) / (aspect > 1 ? 0.9 : 0.9 * aspect);
    };
    const leave = () => { pointer.x = 10; pointer.y = 10; };
    canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerleave", leave);
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; });
    observer.observe(canvas);
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      image.onload = null; image.onerror = null;
      canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("webglcontextlost", onLost);
      buffers.forEach(buffer => gl.deleteBuffer(buffer)); shaders.forEach(shader => gl.deleteShader(shader)); gl.deleteProgram(program);
    };
  }, []);

  return <main className={styles.page}>
    <header className={styles.header}><a href="/">COIL<span> / VISUAL LAB</span></a><span className={styles.preview}>EXPERIMENT 001</span></header>
    <section className={styles.hero}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>THE POWERFUL MAN</p>
        <h1>Gentle.<br />Fierce.<br /><em>Alive.</em></h1>
        <p className={styles.description}>The same wolf. A different dimension.<br />Thousands of particles. One powerful presence.</p>
        <div className={styles.controls} aria-label="Particle modes">{modes.map((name, index) => <button key={name} aria-pressed={mode === index} onClick={() => setMode(index)}>{name}</button>)}</div>
        <p className={styles.hint}>Move across the wolf to disturb the field.</p>
      </div>
      <div className={styles.stage}>
        <div className={styles.halo} />
        {/* The original is also the accessible fallback for unsupported graphics. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.fallback} style={{ opacity: ready && !failed ? 0 : 1 }} src="/brand/the-powerful-man-wolf.png" alt="The Powerful Man’s wolf with blue eyes holding a red rose" />
        <canvas ref={canvasRef} className={styles.canvas} data-ready={ready} aria-hidden="true" style={{ opacity: failed ? 0 : 1 }} />
        <span className={styles.stageLabel}>WOLF / PARTICLE STUDY</span>
        <button className={styles.pause} onClick={() => setPaused(value => !value)}>{paused ? "Resume motion" : "Pause motion"}</button>
        {failed && <span className={styles.status}>Original logo · animation unavailable</span>}
      </div>
    </section>
    <footer className={styles.footer}><span>GENTLE AS HE IS FIERCE.</span><a href="https://thepowerfulman.com/" target="_blank" rel="noreferrer">Official logo · The Powerful Man ↗</a><span>COIL PREVIEW / NOT PRODUCTION</span></footer>
  </main>;
}
