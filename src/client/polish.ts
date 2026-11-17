import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// The "polished" render path, used by the themes that opt into it (Orbit Diner for now):
//   scene -> cartoon outlines + colour grade -> ambient occlusion -> bloom -> tone mapping -> anti-aliasing.
// Outlines are found from the depth buffer the first render already writes, so they cost one cheap full-screen pass
// rather than drawing the scene twice. Phones skip the ambient occlusion and anti-aliasing and bloom at lower
// resolution, which keeps them smooth.

// Dark ink lines wherever depth jumps (silhouettes against the floor, the deck or space), then a gentle grade:
// a touch more saturation and contrast, and shadows nudged towards the theme's tint.
const OutlineGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraNear: { value: 0.5 },
    cameraFar: { value: 200 },
    thickness: { value: 1 },
    inkColour: { value: new THREE.Color(0x14102a) },
    inkStrength: { value: 0.8 },
    saturation: { value: 1.08 },
    contrast: { value: 1.06 },
    shadowTint: { value: new THREE.Color(0x1a2a5a) },
    // Ink fades out between these view distances, so the planet and stars stay soft wherever the camera sits.
    fadeNear: { value: 60 },
    fadeFar: { value: 90 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 resolution;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform float thickness;
    uniform vec3 inkColour;
    uniform float inkStrength;
    uniform float saturation;
    uniform float contrast;
    uniform vec3 shadowTint;
    uniform float fadeNear;
    uniform float fadeFar;
    varying vec2 vUv;

    float viewDepth(vec2 uv) {
      float z = texture2D(tDepth, uv).x;
      return -perspectiveDepthToViewZ(z, cameraNear, cameraFar);
    }

    void main() {
      vec4 colour = texture2D(tDiffuse, vUv);
      vec2 step = thickness / resolution;
      float centre = viewDepth(vUv);
      // How far the neighbours stand in front of this pixel, relative to its distance: big jumps are outlines.
      float edge = 0.0;
      edge = max(edge, centre - viewDepth(vUv + vec2(step.x, 0.0)));
      edge = max(edge, centre - viewDepth(vUv - vec2(step.x, 0.0)));
      edge = max(edge, centre - viewDepth(vUv + vec2(0.0, step.y)));
      edge = max(edge, centre - viewDepth(vUv - vec2(0.0, step.y)));
      float line = smoothstep(0.015, 0.05, edge / centre) * inkStrength;
      // Far-away things (the planet, the stars) get no ink, so space stays soft.
      line *= 1.0 - smoothstep(fadeNear, fadeFar, centre);
      vec3 rgb = mix(colour.rgb, inkColour, line);

      float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      rgb = mix(vec3(luma), rgb, saturation);
      rgb = (rgb - 0.18) * contrast + 0.18;
      rgb += shadowTint * 0.06 * (1.0 - smoothstep(0.0, 0.25, luma));
      gl_FragColor = vec4(max(rgb, 0.0), colour.a);
    }
  `,
};

export interface Polish {
  readonly enabled: boolean;
  // Drops the most expensive effect still on (ambient occlusion, then anti-aliasing); false when nothing is left to drop.
  degrade(): boolean;
  setEnabled(on: boolean): void;
  setSize(width: number, height: number): void;
  render(): void;
}

export function createPolish(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, lowPower: boolean): Polish {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // Half-float colour keeps glowing lights above 1 for the bloom; the depth texture feeds the outlines.
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(size.x, size.y),
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(renderer.getPixelRatio());

  const render = new RenderPass(scene, camera);
  const outline = new ShaderPass(OutlineGradeShader);
  const ao = lowPower ? null : new GTAOPass(scene, camera, size.x, size.y);
  if (ao) {
    ao.blendIntensity = 0.75;
    ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 1, scale: 1 });
  }
  // Only things clearly brighter than white bloom, and gently: threshold just above 1 in HDR and a moderate strength,
  // the usual recipe for a soft glow that never turns highlights into flat white blobs.
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.36, 0.32, 1.05);
  const output = new OutputPass();
  const smaa = lowPower ? null : new SMAAPass();

  composer.addPass(render);
  composer.addPass(outline);
  if (ao) composer.addPass(ao);
  composer.addPass(bloom);
  composer.addPass(output);
  if (smaa) composer.addPass(smaa);

  let enabled = false;
  const syncUniforms = () => {
    const { width, height } = renderer.getDrawingBufferSize(new THREE.Vector2());
    outline.uniforms.resolution.value.set(width, height);
    outline.uniforms.cameraNear.value = camera.near;
    outline.uniforms.cameraFar.value = camera.far;
    outline.uniforms.thickness.value = Math.max(1, renderer.getPixelRatio() * 0.75);
  };

  if (import.meta.env.DEV) Object.assign(window, { __polish: { composer, outline, bloom, ao } });

  return {
    get enabled() {
      return enabled;
    },
    degrade() {
      for (const pass of [ao, smaa]) {
        if (pass?.enabled) {
          pass.enabled = false;
          return true;
        }
      }
      return false;
    },
    setEnabled(on) {
      enabled = on;
    },
    setSize(width, height) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
      // Bloom is soft anyway, so phones compute it at a quarter of the pixels.
      if (lowPower) bloom.resolution.set(width / 2, height / 2);
      syncUniforms();
    },
    render() {
      // The outline pass reads the depth that the scene render just wrote, which is the composer's read buffer.
      outline.uniforms.tDepth.value = composer.readBuffer.depthTexture;
      // The kitchen sits round the world origin; anything well beyond it (the planet, the stars) gets no ink.
      const distance = camera.position.length();
      outline.uniforms.fadeNear.value = distance + 18;
      outline.uniforms.fadeFar.value = distance + 40;
      composer.render();
    },
  };
}
