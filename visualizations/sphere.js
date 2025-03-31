import * as THREE from 'three';

let sphere, wireframe, rings = [], particles;
let originalPositions, originalParticlePositions; // Store original geometry data

export function createVisualization(scene, config) {
    const group = new THREE.Group();
    const cfg = config.sphere;

    // --- Main Sphere ---
    const geometry = new THREE.IcosahedronGeometry(
        cfg.radius,
        Math.min(8, cfg.detail) // Clamp detail to prevent performance issues
    );

    // Store original vertex positions for distortion
    originalPositions = geometry.attributes.position.array.slice(); // Create a copy

    // Material with PBR properties
    const material = new THREE.MeshStandardMaterial({
        color: cfg.color2, // Main color
        emissive: cfg.color1, // Emissive color for glow
        emissiveIntensity: 0.4,
        metalness: cfg.metalness,
        roughness: cfg.roughness,
        // clearcoat: cfg.clearcoat, // Clearcoat can be expensive, consider alternatives
        // clearcoatRoughness: 0.3,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide, // Render back faces if distorted inwards
    });

    // Wireframe overlay
    const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: cfg.wireframeOpacity,
        depthWrite: false, // Avoid z-fighting issues
    });

    sphere = new THREE.Mesh(geometry, material);
    wireframe = new THREE.Mesh(geometry.clone(), wireframeMaterial); // Use cloned geometry for wireframe
    sphere.add(wireframe); // Add wireframe as a child
    group.add(sphere);

    // --- Orbital Rings ---
    rings = []; // Clear previous rings if any
    for (let i = 0; i < cfg.ringCount; i++) {
        const ringRadius = cfg.radius * (1.1 + i * cfg.ringSpacing);
        const ringGeometry = new THREE.TorusGeometry(ringRadius, 0.3 + i*0.1, 16, 100); // Thicker outer rings
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(i / cfg.ringCount, 0.8, 0.5),
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, // Additive for glow effect
        });

        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        // Give each ring a slightly different random orientation
        ring.rotation.x = Math.random() * Math.PI;
        ring.rotation.y = Math.random() * Math.PI;
        ring.userData = {
            rotationSpeed: (cfg.ringBaseSpeed + Math.random() * 0.001) * (i % 2 === 0 ? 1 : -1), // Alternate directions
            baseHue: i / cfg.ringCount
        };
        rings.push(ring);
        group.add(ring);
    }

    // --- Ambient Particles ---
    const particlesGeometry = new THREE.BufferGeometry();
    const particleCount = cfg.particleCount;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3); // Add colors attribute
    const baseRadius = cfg.radius * cfg.particleSpreadFactor;
    const color1 = new THREE.Color(cfg.color1);
    const color2 = new THREE.Color(cfg.color2);

    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const radius = baseRadius * (1 + (Math.random() - 0.5) * 0.8); // More variation in distance
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1); // Uniform spherical distribution

        positions[i3]   = radius * Math.sin(phi) * Math.cos(theta);
        positions[i3+1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i3+2] = radius * Math.cos(phi);

        // Assign color based on distance from center (or random)
        const lerpFactor = Math.random(); // Random mix of colors
        const color = color1.clone().lerp(color2, lerpFactor);
        colors[i3]   = color.r;
        colors[i3+1] = color.g;
        colors[i3+2] = color.b;
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); // Set color attribute
    originalParticlePositions = positions.slice(); // Store original positions

    const particlesMaterial = new THREE.PointsMaterial({
        size: cfg.particleSize,
        vertexColors: true, // Use vertex colors
        transparent: true,
        opacity: cfg.particleOpacity,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
    });

    particles = new THREE.Points(particlesGeometry, particlesMaterial);
    group.add(particles);

    return group;
}


export function updateVisualization(group, dataArray, analyser, sensitivity, config) {
    if (!group || !sphere || !particles || rings.length === 0) return; // Ensure elements exist

    const cfg = config.sphere;
    const bufferLength = analyser.frequencyBinCount;

    // Calculate average frequency levels
    const bassAvg = (dataArray[0] + dataArray[1] + dataArray[2]) / (3 * 255);
    const midAvg = dataArray.slice(Math.floor(bufferLength / 4), Math.floor(bufferLength / 2)).reduce((s, v) => s + v, 0) / (bufferLength / 4 * 255);
    const overallAvg = dataArray.reduce((s, v) => s + v, 0) / (bufferLength * 255);

    // --- Update Sphere Distortion ---
    const positions = sphere.geometry.attributes.position;
    const time = Date.now() * 0.0005; // Time for subtle wave effect

    for (let i = 0; i < positions.count; i++) {
        const i3 = i * 3;
        const originalVec = new THREE.Vector3(originalPositions[i3], originalPositions[i3+1], originalPositions[i3+2]);
        const direction = originalVec.clone().normalize();

        // Map vertex to frequency bin - use a mix including vertex position influence
        const freqInfluence = (Math.abs(originalVec.x) + Math.abs(originalVec.y) + Math.abs(originalVec.z)) / (cfg.radius * 3);
        const freqIndex = Math.min(bufferLength - 1, Math.floor((freqInfluence * 0.5 + Math.sin(time + i * 0.1) * 0.1 + 0.2) * bufferLength));
        const frequency = dataArray[freqIndex] / 255.0;

        // Calculate distortion with sensitivity and a base oscillation
        const distortionAmount = (frequency * cfg.maxDistortion * sensitivity) + Math.sin(time * 2 + i * 0.5) * 1.5; // Add base ripple

        const newPos = originalVec.clone().add(direction.multiplyScalar(distortionAmount));

        // Smooth transition using lerp (optional, can impact performance)
        // const currentPos = new THREE.Vector3(positions.array[i3], positions.array[i3+1], positions.array[i3+2]);
        // currentPos.lerp(newPos, 0.3);
        // positions.setXYZ(i, currentPos.x, currentPos.y, currentPos.z);

        positions.setXYZ(i, newPos.x, newPos.y, newPos.z);
    }
    positions.needsUpdate = true;
    sphere.geometry.computeVertexNormals(); // Recalculate normals for correct lighting

    // Update sphere material based on overall audio volume
    sphere.material.emissiveIntensity = 0.3 + overallAvg * 1.2; // More intense emission
    sphere.material.color.setHSL(0.3 + midAvg * 0.4, 0.8, 0.5 + overallAvg * 0.2); // Shift color hue and lightness
    wireframe.material.opacity = cfg.wireframeOpacity + bassAvg * 0.1; // Wireframe pulses slightly with bass

    // --- Update Orbital Rings ---
    rings.forEach((ring, index) => {
        const speedFactor = 1 + midAvg * 2.0; // Rotation speed influenced by mids
        ring.rotation.y += ring.userData.rotationSpeed * speedFactor;
        ring.rotation.x += ring.userData.rotationSpeed * 0.5 * speedFactor * Math.sin(time + index); // Add wobble

        // Update opacity and color based on bass/mids
        ring.material.opacity = 0.15 + bassAvg * 0.6 + midAvg * 0.2;
        const hue = (ring.userData.baseHue + bassAvg * 0.1) % 1.0;
        ring.material.color.setHSL(hue, 0.9, 0.5 + midAvg * 0.3); // Brighter with mids
    });

    // --- Update Particles ---
    const particlePositions = particles.geometry.attributes.position;
    const baseRadius = cfg.radius * cfg.particleSpreadFactor;

    for (let i = 0; i < cfg.particleCount; i++) {
        const i3 = i * 3;
        // Use mid-high frequencies for particle movement
        const freqIndex = Math.min(bufferLength - 1, Math.floor(bufferLength / 2 + (i / cfg.particleCount) * (bufferLength / 2)));
        const frequencyValue = dataArray[freqIndex] / 255.0;

        // Push particles outward based on frequency and sensitivity
        const offset = frequencyValue * 30 * sensitivity; // Stronger push
        const originalPos = new THREE.Vector3(originalParticlePositions[i3], originalParticlePositions[i3+1], originalParticlePositions[i3+2]);
        const direction = originalPos.clone().normalize();
        const targetPos = originalPos.clone().add(direction.multiplyScalar(offset));

        // Add subtle swirling motion independent of audio
        const swirlAngle = time * 0.5 + (i / cfg.particleCount) * Math.PI * 4;
        const swirlRadius = 2.0;
        targetPos.x += Math.cos(swirlAngle) * swirlRadius;
        targetPos.z += Math.sin(swirlAngle) * swirlRadius;


        // Lerp towards target position for smoother movement
        const currentPos = new THREE.Vector3(particlePositions.array[i3], particlePositions.array[i3+1], particlePositions.array[i3+2]);
        currentPos.lerp(targetPos, 0.05); // Adjust lerp factor for desired smoothness

        particlePositions.setXYZ(i, currentPos.x, currentPos.y, currentPos.z);
    }
    particlePositions.needsUpdate = true;
    particles.material.opacity = Math.min(1.0, cfg.particleOpacity + overallAvg * 0.4); // Fade in/out with volume
    particles.rotation.y += 0.0005; // Slow rotation of the particle cloud

    // Rotate the entire visualization group slowly
    // group.rotation.y += 0.0005;
    // group.rotation.x += 0.0003;
}