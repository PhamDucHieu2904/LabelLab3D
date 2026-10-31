import * as THREE from "three";

export interface StudioGroundController {
  setEnabled(enabled: boolean): void;
  setFloorY(y: number): void;
  setRadius(radius: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

/** White perspective studio floor in model metres. Fit to upright model bounds. */
export function createStudioGround(scene: THREE.Scene): StudioGroundController {
  const group = new THREE.Group();
  group.name = "Labellab studio ground";
  group.visible = false;
  const floorGeometry = new THREE.PlaneGeometry(200, 200);
  const floorMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
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
    vertexShader: `
      varying vec2 contactUv;
      void main() {
        contactUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 contactUv;
      void main() {
        float r = length((contactUv - 0.5) * 2.0);
        float alpha = exp(-r * r * 6.0) * (1.0 - smoothstep(0.65, 1.0, r)) * 0.20;
        gl_FragColor = vec4(vec3(0.0), alpha);
      }
    `,
  });
  const contact = new THREE.Mesh(contactGeometry, contactMaterial);
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.00004;
  contact.renderOrder = 2;
  group.add(contact);
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
      if (!disposed && Number.isFinite(radius) && radius > 0)
        contact.scale.setScalar(radius);
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
    },
  };
}
