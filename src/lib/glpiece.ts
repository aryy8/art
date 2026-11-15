import * as THREE from "three";

/** Small helper shared by full-frame shader pieces: one canvas, one renderer, a fullscreen quad. */
export class GLSurface {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly quad: THREE.Mesh;
  private scene = new THREE.Scene();
  width = 1;
  height = 1;

  constructor(host: HTMLElement, clear = 0xfbfaf7) {
    this.canvas = document.createElement("canvas");
    host.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // shaders write display values directly
    this.renderer.setClearColor(clear, 1);
    this.renderer.autoClear = false;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setSize(w: number, h: number) {
    this.width = Math.max(1, Math.round(w));
    this.height = Math.max(1, Math.round(h));
    this.renderer.setSize(this.width, this.height, false);
  }

  /** Draw `material` over the full target (or the canvas when target is null). */
  draw(material: THREE.Material, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.quad.geometry.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Ping-pong pair of float render targets for simulations. */
export class PingPong {
  a: THREE.WebGLRenderTarget;
  b: THREE.WebGLRenderTarget;
  constructor(w: number, h: number) {
    const opts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.a = new THREE.WebGLRenderTarget(w, h, opts);
    this.b = new THREE.WebGLRenderTarget(w, h, opts);
  }
  swap() {
    const t = this.a;
    this.a = this.b;
    this.b = t;
  }
  dispose() {
    this.a.dispose();
    this.b.dispose();
  }
}
