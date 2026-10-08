"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./wolf.module.css";
import { sculptWolfDetails } from "./sculpture";

// The original artwork supplies color, not a textured plane. Every sample becomes
// a free particle on (or inside) a sculpted head, with a separate 3D trajectory.
const vertex = `
attribute vec3 position;
attribute vec3 color;
attribute vec3 normal;
attribute vec4 particle;
uniform float time;
uniform float motion;
uniform float assembly;
uniform float burst;
uniform float aspect;
uniform float pointScale;
uniform vec2 rotation;
uniform vec3 pointer;
uniform vec2 origin;
varying vec3 tint;
varying float opacity;
void main() {
  float seed = particle.x;
  float phase = seed * 62.83185;
  float loose = particle.y;
  float wander = pow(max(0.0, sin(time * 0.65 + phase)), 12.0);
  float amplitude = loose < -2.5 ? 0.0 : (loose < 0.0 ? 0.003 + wander * 0.014 : 0.008 + loose * 0.025 + wander * 0.075) * motion;
  vec3 p = position;
  p += vec3(sin(time * 1.2 + phase + p.y * 4.0),
            cos(time * 0.9 + phase * 1.7 + p.x * 3.0),
            sin(time * 1.1 + phase * 2.3)) * amplitude;
  // Sparse orbiting particles make the volume and continuous flow legible.
  if (loose > 1.5) {
    float angle = time * (0.15 + seed * 0.14) * motion;
    p.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.xz;
    p.y += sin(time * 0.7 + phase) * 0.065 * motion;
  }
  // Start as a free 3D cloud; staggered, curved paths gather into the head.
  // At completion this is exactly the existing sculpture, not a new geometry.
  float gather = smoothstep(seed * 0.18, 0.78 + seed * 0.22, assembly);
  vec3 cloud = (fract(sin(vec3(seed * 127.1 + 3.0, seed * 311.7 + 8.0,
    seed * 74.7 + 13.0)) * 43758.5453) * 2.0 - 1.0) * vec3(1.65, 1.65, 1.2);
  p = mix(cloud, p, gather);
  p.xy += vec2(cos(phase + assembly * 4.0), sin(phase + assembly * 4.0))
    * sin(gather * 3.14159) * 0.18;
  float yaw = rotation.x;
  float pitch = rotation.y;
  p.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * p.xz;
  p.yz = mat2(cos(pitch), -sin(pitch), sin(pitch), cos(pitch)) * p.yz;
  // Interaction is applied in projected space, so the disturbed area stays
  // under the actual finger/cursor even when the sculpture is turned.
  float perspective = 3.6 / (3.6 - p.z);
  vec2 delta = p.xy * perspective - pointer.xy;
  float influence = exp(-dot(delta, delta) * 9.0) * pointer.z;
  vec2 away = normalize(delta + vec2(0.0001));
  p.xy += (away * 0.30 + vec2(-away.y, away.x) * 0.10) * influence;
  p.z += influence * (0.18 + seed * 0.17);
  vec3 outward = normalize(vec3(p.xy - origin * 0.35, p.z + 0.15)
    + vec3(sin(phase * 3.1), cos(phase * 2.7), sin(phase * 4.3)) * 0.65);
  p += outward * burst * (0.8 + seed * 1.4);
  p.xy += vec2(-outward.y, outward.x) * burst * 0.32;
  float distance = max(1.1, 3.6 - p.z);
  vec2 fit = aspect > 1.0 ? vec2(0.86 / aspect, 0.86) : vec2(0.86, 0.86 * aspect);
  gl_Position = vec4(p.xy * fit * 3.6, (distance - 3.6) * 0.15 * distance, distance);
  gl_PointSize = clamp(particle.z * pointScale * 3.6 / distance, 1.0, 12.0);
  float depthLight = clamp(0.75 + p.z * 0.27, 0.4, 1.2);
  vec3 n = normal;
  n.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * n.xz;
  n.yz = mat2(cos(pitch), -sin(pitch), sin(pitch), cos(pitch)) * n.yz;
  float sculptLight = length(n) > 0.5 ? 0.40 + 0.75 * abs(dot(n, normalize(vec3(-0.4, 0.65, 1.0)))) : 1.0;
  tint = color * depthLight * sculptLight;
  opacity = particle.w * (0.84 + 0.16 * sin(phase + time * 1.6 * motion))
    * mix(0.28, 1.0, gather);
}`;
const fragment = `
precision mediump float;
varying vec3 tint;
varying float opacity;
void main() {
  float radius = length(gl_PointCoord - 0.5) * 2.0;
  if (radius > 1.0) discard;
  float alpha = (1.0 - smoothstep(0.25, 1.0, radius)) * opacity;
  gl_FragColor = vec4(tint, alpha);
}`;

export default function WolfPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = preference.matches;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, powerPreference: "low-power" });
    if (!gl) { setFailed(true); return; }
    let disposed = false;
    let frame = 0;
    let loaded = false;
    let elapsed = 0;
    let assemblyAge = 0;
    let last = 0;
    let burstAge = 20;
    let burstCount = 0;
    let paused = false;
    let yaw = 0.20;
    let pitch = -0.04;
    let turnX = 0;
    let turnY = 0;
    let drag: { id: number; x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
    const pointer = { x: 0, y: 0, strength: 0, target: 0, tiltX: 0, tiltY: 0 };
    const origin = { x: 0, y: 0 };
    const shaders: WebGLShader[] = [];
    const buffers: WebGLBuffer[] = [];
    const program = gl.createProgram();
    if (!program) { setFailed(true); return; }
    let uniforms: Record<string, WebGLUniformLocation | null> = {};
    let count = 0;
    let meshCount = 0;
    let meshBuffer: WebGLBuffer | null = null;
    const pointAttributes: { buffer: WebGLBuffer; location: number; size: number }[] = [];

    const schedule = () => {
      if (!frame && loaded && !disposed && !document.hidden) frame = requestAnimationFrame(render);
    };
    const render = (now: number) => {
      frame = 0;
      if (disposed || document.hidden) return;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      last = now;
      if (!reduced && !paused) elapsed += dt;
      if (!paused) assemblyAge = Math.min(2.8, assemblyAge + dt);
      const assembly = reduced || assemblyAge >= 2.8 ? 1 : Math.max(0, (assemblyAge - 0.35) / 2.45);
      canvas.dataset.assembled = String(assembly === 1);
      burstAge += dt;
      const easing = 1 - Math.exp(-dt * 8);
      pointer.strength += (pointer.target - pointer.strength) * easing;
      const targetYaw = 0.20 + (reduced || paused ? 0 : Math.sin(elapsed * 0.34) * 0.30) + turnX + pointer.tiltX;
      const targetPitch = -0.04 + (reduced || paused ? 0 : Math.sin(elapsed * 0.27) * 0.09) + turnY + pointer.tiltY;
      yaw += (targetYaw - yaw) * easing;
      pitch += (targetPitch - pitch) * easing;
      const burst = (1 - Math.exp(-burstAge * 9)) * Math.exp(-burstAge * 1.15) * (reduced ? 0.08 : 0.35);
      // Bound both fill rate and geometry on phones/high-DPR displays.
      const ratio = Math.min(window.devicePixelRatio || 1, 1.75, 1900 / Math.max(canvas.clientWidth, canvas.clientHeight));
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(uniforms.time, elapsed);
      gl.uniform1f(uniforms.motion, reduced ? 0 : 1);
      gl.uniform1f(uniforms.assembly, assembly);
      gl.uniform1f(uniforms.burst, burst);
      gl.uniform1f(uniforms.aspect, width / height);
      gl.uniform1f(uniforms.pointScale, ratio * Math.max(0.72, Math.min(canvas.clientWidth, canvas.clientHeight) / 700));
      gl.uniform2f(uniforms.rotation, yaw, pitch);
      gl.uniform3f(uniforms.pointer, pointer.x, pointer.y, pointer.strength);
      gl.uniform2f(uniforms.origin, origin.x, origin.y);
      // A depth-only skin prevents rear petals and white muzzle particles from
      // shining through the black nose. It is never visible as a solid object.
      // Scattered startup/burst points remain free of this assembled occluder.
      if (meshBuffer && assembly === 1 && burst < .002) {
        for (const attribute of pointAttributes) gl.disableVertexAttribArray(attribute.location);
        const position = pointAttributes[0].location;
        gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer);
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttrib4f(pointAttributes[3].location, .5, -3, 1, 1);
        gl.colorMask(false, false, false, false);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1, 1);
        gl.drawArrays(gl.TRIANGLES, 0, meshCount);
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.colorMask(true, true, true, true);
      }
      for (const attribute of pointAttributes) {
        gl.bindBuffer(gl.ARRAY_BUFFER, attribute.buffer);
        gl.enableVertexAttribArray(attribute.location);
        gl.vertexAttribPointer(attribute.location, attribute.size, gl.FLOAT, false, 0, 0);
      }
      gl.drawArrays(gl.POINTS, 0, count);
      if ((!reduced && !paused) || (!paused && assembly < 1) || burstAge < 7 || Math.abs(pointer.target - pointer.strength) > 0.001
        || Math.abs(targetYaw - yaw) > 0.001 || Math.abs(targetPitch - pitch) > 0.001) schedule();
    };
    const fail = () => {
      if (disposed) return;
      loaded = false;
      cancelAnimationFrame(frame);
      frame = 0;
      setReady(false);
      setFailed(true);
    };
    const onLost = (event: Event) => { event.preventDefault(); fail(); };
    canvas.addEventListener("webglcontextlost", onLost);
    const image = new Image();
    image.onerror = fail;
    image.onload = () => {
      if (disposed) return;
      try {
        for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
          const shader = gl.createShader(type);
          if (!shader) throw new Error("Shader unavailable");
          shaders.push(shader);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Shader unavailable");
          gl.attachShader(program, shader);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Renderer unavailable");
        gl.useProgram(program);
        const sample = document.createElement("canvas");
        sample.width = window.matchMedia("(max-width: 600px)").matches ? 256 : 336;
        sample.height = Math.round(sample.width * image.naturalHeight / image.naturalWidth);
        const ctx = sample.getContext("2d");
        if (!ctx) throw new Error("Image sampling unavailable");
        ctx.drawImage(image, 0, 0, sample.width, sample.height);
        const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
        const positions: number[] = [], colors: number[] = [], particles: number[] = [], normals: number[] = [];
        let randomState = 7319;
        const random = () => {
          randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
          return randomState / 4294967296;
        };
        const gaussian = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) =>
          Math.exp(-(((x - cx) / sx) ** 2) - ((y - cy) / sy) ** 2);
        const add = (x: number, y: number, z: number, r: number, g: number, b: number, loose: number, opacity: number) => {
          positions.push(x, y, z);
          colors.push(r, g, b);
          normals.push(0, 0, 0);
          particles.push(random(), loose, (1.6 + random() * 1.4) * (loose < -1 ? 1.35 : 1), opacity);
        };
        for (let y = 0; y < sample.height; y++) for (let x = 0; x < sample.width; x++) {
          const i = (y * sample.width + x) * 4;
          if (pixels[i + 3] < 110) continue;
          const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
          const light = Math.max(r, g, b);
          const colored = r > g * 1.4 || b > r * 1.25;
          if (light < 0.12 && random() > 0.34) continue;
          if (light > 0.12 && !colored && random() > 0.77) continue;
          const px = (x / sample.width - 0.5) * 1.86;
          const py = (0.5 - y / sample.height) * 2;
          // The original artwork still colors the cranium, cheek masses and eyes;
          // explicit meshes below supply the protruding snout and flower.
          const head = gaussian(px, py, 0, 0.03, 0.65, 0.80);
          // Replace the central muzzle and whole bloom with actual mesh surfaces.
          const bloomRegion = px < -.36 && py < -.22 && py > -.72;
          const stemRegion = py < -.365 && py > -.445 && px > -.40 && light < .20;
          if (bloomRegion || stemRegion) { continue; }
          const cheeks = gaussian(Math.abs(px), py, 0.38, -0.03, 0.22, 0.30);
          const eyes = gaussian(Math.abs(px), py, 0.23, 0.19, 0.12, 0.10);
          let front = -0.13 + head * 0.42 + cheeks * 0.12 - eyes * 0.11;
          // Join the retained open jaw and teeth to the new snout's underside.
          if (py < -.40 && py > -.66 && Math.abs(px - .038) < .24) front += .20 * (1 - Math.abs(px - .038) / .3);
          const jitter = 1.4 / sample.width;
          const blueEye = b > r * 1.25 && b > 0.35;
          const surfaceZ = front + (blueEye ? 0.11 : 0) + (random() - 0.5) * 0.045;
          // Slightly lit charcoal preserves the black fur and nose on black.
          const cr = Math.max(r * (blueEye ? 0.7 : 0.95), 0.085);
          const cg = Math.max(g * (blueEye ? 1.35 : 0.96), 0.105);
          const cb = Math.max(b * (blueEye ? 1.7 : 1), 0.13);
          add(px + (random() - 0.5) * jitter, py + (random() - 0.5) * jitter, surfaceZ, cr, cg, cb, blueEye ? -2 : colored ? -1 : 0, 0.94);
          // A closed curved back and random interior samples produce real
          // thickness rather than several identical stacked image planes.
          if (random() < 0.22 && head > 0.18) {
            const depth = random();
            const back = -0.20 - head * 0.46;
            const z = back + (front - back) * depth;
            const taper = 0.76 + 0.24 * Math.sin(depth * Math.PI / 2);
            add(px * taper, py * taper, z, cr * 0.43, cg * 0.48, cb * 0.57, 1, 0.53);
          }
          if (random() < 0.12 && head > 0.22) {
            add(px * 0.85, py * 0.91, -0.20 - head * 0.46, cr * 0.32, cg * 0.39, cb * 0.50, 0.7, 0.6);
          }
        }
        const detailBudget = Math.round(16500 * (sample.width / 336) ** 2);
        const mesh = sculptWolfDetails(random, detailBudget, (p, color, normal, size) => {
          add(...p, ...color, -3, .96);
          normals.splice(normals.length - 3, 3, ...normal);
          particles[particles.length - 2] *= size;
        });
        canvas.dataset.sculptedParticles = String(detailBudget);
        canvas.dataset.meshTriangles = String(mesh.triangleCount);
        meshBuffer = gl.createBuffer();
        if (!meshBuffer) throw new Error("Sculpture buffer unavailable");
        buffers.push(meshBuffer);
        gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.positions), gl.STATIC_DRAW);
        meshCount = mesh.positions.length / 3;
        for (let i = 0; i < 650; i++) {
          const angle = random() * Math.PI * 2;
          const radius = 0.85 + random() * 0.58;
          const y = (random() - 0.5) * 2.25;
          const red = i % 9 === 0;
          add(Math.cos(angle) * radius, y, Math.sin(angle) * radius * 0.65,
            red ? 0.68 : 0.31, red ? 0.09 : 0.42, red ? 0.08 : 0.54, 2, 0.30 + random() * 0.30);
        }
        const attribute = (name: string, values: number[], size: number) => {
          const buffer = gl.createBuffer();
          if (!buffer) throw new Error("Particle buffer unavailable");
          buffers.push(buffer);
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
          const location = gl.getAttribLocation(program, name);
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
          pointAttributes.push({ buffer, location, size });
        };
        attribute("position", positions, 3);
        attribute("color", colors, 3);
        attribute("normal", normals, 3);
        attribute("particle", particles, 4);
        count = particles.length / 4;
        uniforms = Object.fromEntries(["time", "motion", "assembly", "burst", "aspect", "pointScale", "rotation", "pointer", "origin"]
          .map(name => [name, gl.getUniformLocation(program, name)]));
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.enable(gl.DEPTH_TEST);
        gl.clearColor(0, 0, 0, 0);
        canvas.dataset.particles = String(count);
        let minDepth = Infinity, maxDepth = -Infinity;
        for (let i = 2; i < positions.length; i += 3) { minDepth = Math.min(minDepth, positions[i]); maxDepth = Math.max(maxDepth, positions[i]); }
        canvas.dataset.depthRange = (maxDepth - minDepth).toFixed(3);
        loaded = true;
        setReady(true);
        schedule();
      } catch { fail(); }
    };
    image.src = "/brand/the-powerful-man-wolf.png";

    const move = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width * 2 - 1;
      const ny = 1 - (event.clientY - rect.top) / rect.height * 2;
      const aspect = rect.width / rect.height;
      pointer.x = nx / (aspect > 1 ? 0.86 / aspect : 0.86);
      pointer.y = ny / (aspect > 1 ? 0.86 : 0.86 * aspect);
      if (drag && drag.id === event.pointerId) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (Math.hypot(dx, dy) > 6) drag.moved = true;
        if (drag.moved) {
          turnX = drag.yaw + dx / Math.min(rect.width, rect.height) * Math.PI * 2;
          turnY = Math.max(-1.4, Math.min(1.4, drag.pitch - dy / Math.min(rect.width, rect.height) * Math.PI));
          pointer.target = 0;
          pointer.tiltX = 0;
          pointer.tiltY = 0;
          schedule();
          return;
        }
      }
      pointer.target = reduced ? 0.08 : 0.12;
      pointer.tiltX = nx * (reduced ? 0.03 : 0.05);
      pointer.tiltY = -ny * (reduced ? 0.02 : 0.03);
      schedule();
    };
    const leave = () => {
      pointer.target = 0;
      pointer.tiltX = 0;
      pointer.tiltY = 0;
      schedule();
    };
    const explode = () => {
      burstAge = 0;
      origin.x = pointer.x;
      origin.y = pointer.y;
      canvas.dataset.bursts = String(++burstCount);
      schedule();
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || drag) return;
      move(event);
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw: turnX, pitch: turnY, moved: false };
      canvas.setPointerCapture(event.pointerId);
    };
    const up = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      move(event);
      const tapped = !drag.moved;
      drag = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (tapped) explode();
      if (event.pointerType !== "mouse") leave();
    };
    const cancel = () => { drag = null; leave(); };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Enter") { event.preventDefault(); explode(); }
      if (event.key === " ") { event.preventDefault(); paused = !paused; schedule(); }
      if (event.key === "Escape") { burstAge = 20; leave(); }
    };
    const visibility = () => {
      last = 0;
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
      else schedule();
    };
    const motionChange = () => { reduced = preference.matches; schedule(); };
    const resize = new ResizeObserver(schedule);
    resize.observe(canvas);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", visibility);
    preference.addEventListener("change", motionChange);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      image.onload = null; image.onerror = null;
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("keydown", key);
      canvas.removeEventListener("webglcontextlost", onLost);
      document.removeEventListener("visibilitychange", visibility);
      preference.removeEventListener("change", motionChange);
      buffers.forEach(buffer => gl.deleteBuffer(buffer));
      shaders.forEach(shader => gl.deleteShader(shader));
      gl.deleteProgram(program);
    };
  }, []);

  return <main className={styles.page}>
    {/* The original appears only if graphics fail; startup remains particle-only. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className={styles.fallback} style={{ opacity: failed ? 1 : 0 }}
      src="/brand/the-powerful-man-wolf.png" alt="Wolf with blue eyes holding a red rose"
      aria-hidden={!failed} />
    <canvas ref={canvasRef} className={styles.canvas} data-ready={ready && !failed}
      data-bursts="0" tabIndex={ready && !failed ? 0 : -1} role="img" aria-hidden={!ready || failed}
      aria-label="Interactive three-dimensional wolf made of moving particles. Drag to rotate the volume. Click, tap or press Enter for a small particle burst. Press Space to pause motion."
      style={{ opacity: failed ? 0 : 1 }} />
  </main>;
}
