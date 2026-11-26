import * as THREE from "three";

export type StudioContactShape = "circle" | "rounded-box";

export interface StudioGroundController {
  setEnabled(enabled: boolean): void;
  setFloorY(y: number): void;
  setRadius(radius: number): void;
  setContactFootprint(width: number, depth: number, shape?: StudioContactShape): void;
  setDynamicShadowActive(active: boolean): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

/** White perspective studio floor in model metres. Fit to upright model bounds. */
export function createStudioGround(scene: THREE.Scene): StudioGroundController {
  const group = new THREE.Group();
  group.name = "HyperMockup studio ground";
  group.visible = false;
  const floorGeometry = new THREE.PlaneGeometry(200, 200);
  const floorMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = false;
  floor.castShadow = false;
  group.add(floor);

  const gridMaterial = new THREE.ShaderMaterial({
    transparent: true,
    premultipliedAlpha: true,
    // The ground is rendered alone into the studio matte, before the product.
    // Layer grid ink by renderOrder instead of comparing its 20 μm floor gap
    // against the matte camera's long depth range (which flickers while orbiting).
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { gridColor: { value: new THREE.Color("#bfc6ce") } },
    vertexShader: `
      varying vec3 groundWorld;
      varying vec4 groundClip;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        groundWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
        groundClip = gl_Position;
      }
    `,
    fragmentShader: `
      varying vec3 groundWorld;
      varying vec4 groundClip;
      uniform vec3 gridColor;
      float gridLine(vec2 p) {
        vec2 width = max(fwidth(p), vec2(0.00001));
        vec2 distanceToLine = abs(fract(p - 0.5) - 0.5) / width;
        // Fade each axis before its period becomes subpixel at grazing angles.
        // Without this, derivative smoothing converges to a solid grey horizon.
        vec2 coverage = (1.0 - min(distanceToLine, vec2(1.0)))
          * (1.0 - smoothstep(vec2(0.25), vec2(1.0), width));
        return max(coverage.x, coverage.y);
      }
      void main() {
        float minor = gridLine(groundWorld.xz * 10.0);
        float major = gridLine(groundWorld.xz);
        float fade = 1.0 - smoothstep(12.0, 20.0, distance(cameraPosition, groundWorld));
        // Fade only grid ink in the outer 8% of the viewport. The white matte,
        // product and contact shadow retain their full coverage at frame edges.
        vec2 viewportUv = groundClip.xy / groundClip.w * 0.5 + 0.5;
        vec2 edgeDistance = min(viewportUv, 1.0 - viewportUv);
        float viewportFade = smoothstep(0.0, 0.08, min(edgeDistance.x, edgeDistance.y));
        float alpha = max(minor * 0.22, major * 0.38) * fade * viewportFade;
        gl_FragColor = vec4(gridColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb *= gl_FragColor.a;
      }
    `,
  });
  // A shared geometry is disposed exactly once below.
  const grid = new THREE.Mesh(floorGeometry, gridMaterial);
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 0.00002;
  grid.renderOrder = 1;
  group.add(grid);

  const contactGeometry = new THREE.PlaneGeometry(2.4, 2.4);
  const contactMaterial = new THREE.ShaderMaterial({
    transparent: true,
    premultipliedAlpha: true,
    // The contact wash belongs above both floor and grid in that same matte.
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uShape: { value: 0 }, // 0 = radial circle (bottles/cans), 1 = rounded box (boxes/trays)
      uBoxHalf: { value: new THREE.Vector2(0.55, 0.55) },
      uFeather: { value: 0.35 },
      uStrength: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 contactUv;
      void main() {
        contactUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 contactUv;
      uniform float uShape;
      uniform vec2 uBoxHalf;
      uniform float uFeather;
      uniform float uStrength;
      void main() {
        vec2 p = (contactUv - 0.5) * 2.0;
        float alpha = 0.0;
        if (uShape < 0.5) {
          float r = length(p);
          alpha = exp(-r * r * 6.0) * (1.0 - smoothstep(0.65, 1.0, r)) * 0.20;
        } else {
          // Soft rounded-rectangle SDF contact occlusion for boxes, trays & flat dielines.
          vec2 d = abs(p) - uBoxHalf;
          float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
          float core = 1.0 - smoothstep(-0.08, uFeather, dist);
          float penumbra = exp(-max(dist, 0.0) * 6.5) * (1.0 - smoothstep(0.0, 0.55, max(dist, 0.0)));
          alpha = clamp(core * 0.16 + penumbra * 0.08, 0.0, 0.22);
        }
        gl_FragColor = vec4(vec3(0.0), alpha * uStrength);
      }
    `,
  });
  const contact = new THREE.Mesh(contactGeometry, contactMaterial);
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.00004;
  contact.renderOrder = 2;
  contact.castShadow = false;
  contact.receiveShadow = false;
  group.add(contact);

  // Real directional cast-shadow receiver used by Parametric Packaging CAD so open lids,
  // tuck flaps, and packed bottles cast accurate soft shadows onto the pure white floor.
  const castShadowMaterial = new THREE.ShadowMaterial({
    color: new THREE.Color("#181c24"),
    opacity: 0.28,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const castShadowPlane = new THREE.Mesh(floorGeometry, castShadowMaterial);
  castShadowPlane.rotation.x = -Math.PI / 2;
  castShadowPlane.position.y = 0.00006;
  castShadowPlane.renderOrder = 3;
  castShadowPlane.receiveShadow = true;
  castShadowPlane.castShadow = false;
  castShadowPlane.visible = false;
  group.add(castShadowPlane);
  scene.add(group);

  const white = new THREE.Color(0xffffff);
  const fog = new THREE.Fog(0xffffff, 12, 20);
  let savedBackground: THREE.Scene["background"] = null;
  let savedFog: THREE.Scene["fog"] = null;
  let enabled = false;
  let disposed = false;

  function setEnabled(next: boolean) {
    if (disposed || enabled === next) return;
    enabled = next;
    group.visible = next;
    if (next) {
      savedBackground = scene.background;
      savedFog = scene.fog;
      scene.background = white;
      scene.fog = fog;
    } else {
      scene.background = savedBackground;
      scene.fog = savedFog;
    }
  }

  return {
    setEnabled,
    setFloorY(y) {
      if (!disposed && Number.isFinite(y)) group.position.y = y;
    },
    setRadius(radius) {
      if (!disposed && Number.isFinite(radius) && radius > 0) {
        contactMaterial.uniforms.uShape.value = 0;
        contact.scale.set(radius, radius, 1);
      }
    },
    setContactFootprint(width, depth, shape = "rounded-box") {
      if (disposed || !Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) return;
      if (shape === "circle") {
        const radius = Math.max(width, depth) * 0.5;
        contactMaterial.uniforms.uShape.value = 0;
        contact.scale.set(radius, radius, 1);
        return;
      }
      // PlaneGeometry(2.4, 2.4) lies in XY then rotated -90 deg on X -> scale.x = world X, scale.y = world Z.
      const pad = Math.max(Math.min(width, depth) * 0.35, 0.035);
      const planeW = width + pad * 2;
      const planeD = depth + pad * 2;
      contactMaterial.uniforms.uShape.value = 1;
      contactMaterial.uniforms.uBoxHalf.value.set(
        Math.min(0.86, Math.max(0.25, (width / planeW) * 0.96)),
        Math.min(0.86, Math.max(0.25, (depth / planeD) * 0.96)),
      );
      contactMaterial.uniforms.uFeather.value = 0.28;
      contact.scale.set(planeW / 2.4, planeD / 2.4, 1);
    },
    setDynamicShadowActive(active) {
      if (disposed) return;
      castShadowPlane.visible = active;
      contactMaterial.uniforms.uStrength.value = active ? 0.52 : 1.0;
    },
    setVisible(visible) {
      if (!disposed) group.visible = enabled && visible;
    },
    dispose() {
      if (disposed) return;
      setEnabled(false);
      disposed = true;
      scene.remove(group);
      floorGeometry.dispose();
      contactGeometry.dispose();
      floorMaterial.dispose();
      gridMaterial.dispose();
      contactMaterial.dispose();
      castShadowMaterial.dispose();
    },
  };
}
