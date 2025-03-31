import * as THREE from 'three';

let terrain, reflection, fogParticles;
let originalPositions, originalFogPositions; // Store original geometry data

export function createVisualization(scene, config) {
    const group = new THREE.Group();
    const cfg = config.terrain;

    // --- Main Terrain ---
    const geometry = new THREE.PlaneGeometry(
        cfg.size,
        cfg.size,
        cfg.segments - 1, // Segments define vertices, faces are segments - 1
        cfg.segments - 1
    );
    geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane

    // Store original Y positions (or all positions if needed)
    originalPositions = geometry.attributes.position.array.slice(); // Copy all vertex data

    // Add vertex colors attribute (will be updated dynamically)
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        metalness: cfg.metalness,
        roughness: cfg.roughness,
        // No clearcoat for terrain usually
        // Add wireframe for debugging or style
        // wireframe: true,
    });

    terrain = new THREE.Mesh(geometry, material);
    group.add(terrain);

    // --- Reflection Plane (Optional but adds depth) ---
    // Using MeshStandardMaterial for potential reflections if env map is added later
    const reflectionGeometry = new THREE.PlaneGeometry(cfg.size * 1.5, cfg.size * 1.5);
    reflectionGeometry.rotateX(-Math.PI / 2);
    const reflectionMaterial = new THREE.MeshStandardMaterial({
        color: 0x050510, // Dark base color
        metalness: 0.9, // Highly reflective
        roughness: 0.3, // Slightly blurred reflection
        transparent: true,
        opacity: 0.4, // Base opacity
        // blending: THREE.AdditiveBlending, // Additive might look strange for reflections
    });
    reflection = new THREE.Mesh(reflectionGeometry, reflectionMaterial);
    reflection.position.y = -cfg.amplitude * 0.3; // Position below the lowest expected terrain point
    group.add(reflection);

    // --- Atmospheric Fog Particles ---
    const fogGeometry = new THREE.BufferGeometry();
    const fogCount = cfg.fogParticleCount;
    const fogPositions = new Float32Array(fogCount * 3);
    const fogColors = new Float32Array(fogCount * 3); // Colors for fog
    const color1 = new THREE.Color(cfg.color1);
    const color2 = new THREE.Color(cfg.color2);

    for (let i = 0; i < fogCount; i++) {
        const i3 = i * 3;
        fogPositions[i3]   = (Math.random() - 0.5) * cfg.size * 1.6; // Spread wider than terrain
        fogPositions[i3+1] = Math.random() * cfg.amplitude * 0.8; // Distribute below max amplitude
        fogPositions[i3+2] = (Math.random() - 0.5) * cfg.size * 1.6;

        // Color variation for fog
        const fogColor = color1.clone().lerp(color2, Math.random() * 0.3); // Mostly valley color
        fogColors[i3]   = fogColor.r;
        fogColors[i3+1] = fogColor.g;
        fogColors[i3+2] = fogColor.b;
    }
    fogGeometry.setAttribute('position', new THREE.BufferAttribute(fogPositions, 3));
    fogGeometry.setAttribute('color', new THREE.BufferAttribute(fogColors, 3)); // Set fog colors
    originalFogPositions = fogPositions.slice(); // Store original fog positions

    const fogMaterial = new THREE.PointsMaterial({
        size: cfg.fogParticleSize,
        vertexColors: true, // Use vertex colors
        transparent: true,
        opacity: cfg.fogParticleOpacity,
        blending: THREE.AdditiveBlending, // Additive looks good for fog
        sizeAttenuation: true,
        depthWrite: false, // Fog shouldn't obscure itself too much
    });

    fogParticles = new THREE.Points(fogGeometry, fogMaterial);
    group.add(fogParticles);

    // Optional: Add Three.js scene fog
    if (cfg.fogDensity > 0) {
      // scene.fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity); // Exponential fog
       scene.fog = new THREE.Fog(cfg.fogColor, cfg.size * 0.5, cfg.size * 2); // Linear fog
    } else {
       scene.fog = null; // Ensure fog is removed if density is 0
    }


    return group;
}


export function updateVisualization(group, dataArray, analyser, sensitivity, config) {
    if (!group || !terrain || !reflection || !fogParticles) return; // Check elements

    const cfg = config.terrain;
    const bufferLength = analyser.frequencyBinCount; // Should match terrain segments ideally
    const positions = terrain.geometry.attributes.position;
    const colors = terrain.geometry.attributes.color;
    const time = Date.now() * cfg.waveSpeed; // Use config for speed

    // Calculate average frequency levels
    const bassAvg = (dataArray[0] + dataArray[1] + dataArray[2]) / (3 * 255);
    const midAvg = dataArray.slice(Math.floor(bufferLength / 4), Math.floor(bufferLength / 2)).reduce((s, v) => s + v, 0) / (bufferLength / 4 * 255);
    const overallAvg = dataArray.reduce((s, v) => s + v, 0) / (bufferLength * 255);

    // --- Update Terrain ---
    const segments = cfg.segments; // Cache segment count
    const color1 = new THREE.Color(cfg.color1);
    const color2 = new THREE.Color(cfg.color2);

    for (let i = 0; i < positions.count; i++) {
        const i3 = i * 3;
        const originalX = originalPositions[i3];
        const originalZ = originalPositions[i3+2];

        // Map vertex X, Z to frequency bin index with wave pattern
        const xNorm = (originalX + cfg.size / 2) / cfg.size; // Normalize 0-1
        const zNorm = (originalZ + cfg.size / 2) / cfg.size; // Normalize 0-1

        // Complex wave pattern influenced by time and position
        const waveFactor = Math.sin(xNorm * Math.PI * 2 + time) * Math.cos(zNorm * Math.PI * 3 + time * 0.7);
        const complexityFactor = Math.sin(xNorm * 5 + zNorm * 8 + time * 1.5) * cfg.waveComplexity;

        // Calculate frequency index (wrap around bufferLength)
        let freqIndex = Math.floor( (xNorm * 0.4 + zNorm * 0.4 + waveFactor * 0.1 + complexityFactor) * bufferLength );
        freqIndex = ((freqIndex % bufferLength) + bufferLength) % bufferLength; // Ensure positive index within bounds


        // Get frequency value and calculate height
        const frequency = dataArray[freqIndex] / 255.0;
        const height = frequency * cfg.amplitude * sensitivity;

        // Apply new height (Y position)
        positions.array[i3+1] = height; // Directly set Y based on original Y (which is 0)

        // Update color based on height and frequency intensity
        const intensity = Math.min(1.0, height / (cfg.amplitude * 0.8)); // Normalize height for color
        const hue = (0.6 + intensity * 0.4) % 1.0; // Blue towards red/purple
        const saturation = 0.7 + frequency * 0.3; // More saturated with stronger freq
        const lightness = 0.3 + intensity * 0.5; // Brighter with height

        // Use HSL for smooth color transitions
        // const color = color1.clone().lerp(color2, intensity); // Alternative: Lerp between config colors

        const color = new THREE.Color().setHSL(hue, saturation, lightness);
        colors.setXYZ(i, color.r, color.g, color.b);
    }

    positions.needsUpdate = true;
    colors.needsUpdate = true;
    terrain.geometry.computeVertexNormals(); // Important for lighting

    // --- Update Reflection ---
    reflection.material.opacity = 0.3 + overallAvg * cfg.reflectionOpacityFactor; // Fade reflection with volume
    reflection.material.color.setHSL(0.6, 0.5, 0.1 + bassAvg * 0.3); // Tint reflection slightly blue based on bass

    // --- Update Fog Particles ---
    const fogPositions = fogParticles.geometry.attributes.position;
    const fogColorsAttribute = fogParticles.geometry.attributes.color; // Get color attribute
    const fogTime = time * 2.5; // Faster time for fog movement

    for (let i = 0; i < cfg.fogParticleCount; i++) {
        const i3 = i * 3;
        // Use lower frequencies for general fog movement/height
        const freqIndex = Math.min(bufferLength - 1, Math.floor((i / cfg.fogParticleCount) * bufferLength * 0.3)); // Use bass/low-mid range
        const frequencyValue = dataArray[freqIndex] / 255.0;

        // Subtle independent movement + audio reaction
        const origX = originalFogPositions[i3];
        const origY = originalFogPositions[i3+1];
        const origZ = originalFogPositions[i3+2];

        // Add circular drift and vertical bounce based on audio
        const driftAngle = fogTime * 0.5 + i * 0.1;
        const driftRadius = 1.5 + Math.sin(i) * 0.5;
        const offsetX = Math.cos(driftAngle) * driftRadius;
        const offsetZ = Math.sin(driftAngle) * driftRadius;
        const offsetY = frequencyValue * cfg.amplitude * 0.5 * sensitivity + Math.sin(fogTime + i*0.2) * 2; // Bounce with audio + sine wave

        fogPositions.setXYZ(i, origX + offsetX, origY + offsetY, origZ + offsetZ);

        // Update fog color alpha based on frequency/intensity (subtle pulsing)
        // This requires modifying the material opacity or using shader logic.
        // For PointsMaterial, we can subtly shift color lightness instead:
        const baseColor = new THREE.Color().fromArray(originalFogPositions, i3); // Assuming original color was stored or re-read attribute
        const fogLightness = 0.4 + frequencyValue * 0.4;
        const fogHSL = {};
        baseColor.getHSL(fogHSL);
        const updatedFogColor = new THREE.Color().setHSL(fogHSL.h, fogHSL.s, fogLightness);
        fogColorsAttribute.setXYZ(i, updatedFogColor.r, updatedFogColor.g, updatedFogColor.b);

    }
    fogPositions.needsUpdate = true;
    fogColorsAttribute.needsUpdate = true; // Mark colors as needing update
    fogParticles.material.opacity = Math.min(1.0, cfg.fogParticleOpacity + midAvg * 0.3); // Overall fog density with mid-range audio

    // Slowly rotate the entire terrain scene for a dynamic view
    // group.rotation.y += 0.0005;
}