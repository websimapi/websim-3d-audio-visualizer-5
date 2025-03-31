import * as THREE from 'three';

let particles;
let positions, colors, velocities, initialRadii, initialAngles, armIndices; // Particle attributes

export function createVisualization(scene, config) {
    const group = new THREE.Group();
    const cfg = config.galaxy;

    const geometry = new THREE.BufferGeometry();
    const particleCount = cfg.particleCount;

    positions = new Float32Array(particleCount * 3);
    colors = new Float32Array(particleCount * 3);
    velocities = new Float32Array(particleCount * 3); // For subtle motion
    initialRadii = new Float32Array(particleCount);   // Store initial radius from center
    initialAngles = new Float32Array(particleCount);  // Store initial angle for spiral calculation
    armIndices = new Float32Array(particleCount);     // Which arm the particle belongs to

    const coreColor = new THREE.Color(cfg.coreColor);
    const armColor1 = new THREE.Color(cfg.armColor1);
    const armColor2 = new THREE.Color(cfg.armColor2);

    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        // Distribute particles in a disk, denser towards center
        const radius = Math.pow(Math.random(), 1.5) * cfg.galaxyRadius; // Power for density falloff
        const angle = Math.random() * Math.PI * 2;
        const armIndex = Math.floor(Math.random() * cfg.armCount); // Assign to a random arm

        // Calculate spiral arm offset angle
        const spiralOffset = (radius / cfg.galaxyRadius) * cfg.spiralFactor;
        const armAngle = (armIndex / cfg.armCount) * Math.PI * 2;
        const finalAngle = angle + armAngle + spiralOffset;

        // Position within the disk thickness
        const thicknessOffset = (Math.random() - 0.5) * cfg.thickness * (1 - radius / cfg.galaxyRadius); // Thinner at edges

        positions[i3]     = Math.cos(finalAngle) * radius; // x
        positions[i3 + 1] = thicknessOffset;               // y (thickness)
        positions[i3 + 2] = Math.sin(finalAngle) * radius; // z

        // Determine color based on distance and arm
        const lerpFactor = radius / cfg.galaxyRadius;
        let color;
        if (radius < cfg.coreRadius) {
            color = coreColor; // Core particles
        } else {
            color = armColor1.clone().lerp(armColor2, lerpFactor); // Arm particles gradient
        }

        colors[i3]     = color.r;
        colors[i3 + 1] = color.g;
        colors[i3 + 2] = color.b;

        // Store initial state for animation
        initialRadii[i] = radius;
        initialAngles[i] = finalAngle;
        armIndices[i] = armIndex;

        // Initial small random velocities for subtle drift
        velocities[i3]   = (Math.random() - 0.5) * 0.01;
        velocities[i3+1] = (Math.random() - 0.5) * 0.01;
        velocities[i3+2] = (Math.random() - 0.5) * 0.01;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Add custom attributes (optional, could also just use the JS arrays)
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('initialRadius', new THREE.BufferAttribute(initialRadii, 1));
    geometry.setAttribute('initialAngle', new THREE.BufferAttribute(initialAngles, 1));
    geometry.setAttribute('armIndex', new THREE.BufferAttribute(armIndices, 1));


    const material = new THREE.PointsMaterial({
        size: cfg.particleSize,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,
        depthWrite: false, // Often looks better for additive blending clouds
    });

    particles = new THREE.Points(geometry, material);
    group.add(particles);

    return group;
}


export function updateVisualization(group, dataArray, analyser, sensitivity, config) {
    if (!group || !particles) return; // Ensure elements exist

    const cfg = config.galaxy;
    const bufferLength = analyser.frequencyBinCount;
    const positionsAttribute = particles.geometry.attributes.position;
    const colorsAttribute = particles.geometry.attributes.color;
    const velocitiesAttribute = particles.geometry.attributes.velocity;
    // Note: Accessing initialRadii, initialAngles etc directly from JS arrays might be faster than reading attributes repeatedly

    const time = Date.now() * 0.0001; // Slow base time evolution

    // Calculate average frequency levels
    const bassAvg = (dataArray[0] + dataArray[1] + dataArray[2] + dataArray[3]) / (4 * 255); // Wider bass range
    const midAvg = dataArray.slice(Math.floor(bufferLength * 0.1), Math.floor(bufferLength * 0.6)).reduce((s, v) => s + v, 0) / (bufferLength * 0.5 * 255);
    const highAvg = dataArray.slice(Math.floor(bufferLength * 0.6)).reduce((s, v) => s + v, 0) / (bufferLength * 0.4 * 255);
    const overallAvg = bassAvg * 0.2 + midAvg * 0.5 + highAvg * 0.3; // Weighted average

    const coreColor = new THREE.Color(cfg.coreColor);
    const armColor1 = new THREE.Color(cfg.armColor1);
    const armColor2 = new THREE.Color(cfg.armColor2);


    for (let i = 0; i < cfg.particleCount; i++) {
        const i3 = i * 3;
        const radius = initialRadii[i];
        const initialAngle = initialAngles[i];
        const armIndex = armIndices[i];

        // --- Calculate Rotation ---
        // Base rotation + differential rotation (faster towards center) + audio influence
        const baseRotation = -time * (1 + (1 - radius / cfg.galaxyRadius) * 2.0); // Faster center
        const audioRotation = highAvg * cfg.armSpinFactor * sensitivity * (radius/cfg.galaxyRadius); // Highs cause outer parts to spin more
        const currentAngle = initialAngle + baseRotation + audioRotation + cfg.rotationSpeed * Date.now()*0.01;


        // --- Calculate Radius / Position ---
        let currentRadius = radius;
        if (radius < cfg.coreRadius) {
            // Core pulses with bass
            currentRadius = radius * (1 + bassAvg * cfg.corePulseFactor * sensitivity);
        } else {
             // Arms expand slightly with mids
             currentRadius = radius * (1 + midAvg * 0.1 * sensitivity);
        }

        // Subtle vertical oscillation based on audio and position
        const freqIndexForY = Math.min(bufferLength - 1, Math.floor((radius / cfg.galaxyRadius) * bufferLength * 0.5 + bufferLength * 0.1)); // low-mids
        const freqValueY = dataArray[freqIndexForY] / 255.0;
        const yOffset = (Math.sin(currentAngle * 3 + time * 10) * 0.5 * cfg.thickness * (1 - radius / cfg.galaxyRadius)) + (freqValueY - 0.2) * 3.0 * sensitivity;


        // Apply calculated position
        positionsAttribute.array[i3]   = Math.cos(currentAngle) * currentRadius; // x
        positionsAttribute.array[i3+1] = yOffset;                               // y
        positionsAttribute.array[i3+2] = Math.sin(currentAngle) * currentRadius; // z

        // --- Calculate Color ---
        const lerpFactor = Math.min(1.0, radius / cfg.galaxyRadius);
        let color;
        if (radius < cfg.coreRadius * (1 + bassAvg * 0.5)) { // Expand core color influence slightly with bass
            const coreIntensity = 0.8 + bassAvg * 0.7; // Brighter core with bass
            color = coreColor.clone().multiplyScalar(coreIntensity);
        } else {
            const armIntensity = 0.6 + midAvg * 0.4 + highAvg * 0.2; // Arms brighten with mid/highs
            const hueShift = highAvg * 0.1; // Shift hue towards armColor2 with highs
            color = armColor1.clone().lerp(armColor2, lerpFactor + hueShift).multiplyScalar(armIntensity);
        }
        // Clamp colors
        color.r = Math.min(1.0, color.r);
        color.g = Math.min(1.0, color.g);
        color.b = Math.min(1.0, color.b);

        colorsAttribute.setXYZ(i, color.r, color.g, color.b);

        // --- Update Velocities (Optional: for extra drift/turbulence) ---
        // Add small random forces or forces based on neighbours (complex)
        // velocitiesAttribute.array[i3] += (Math.random() - 0.5) * 0.001;
        // velocitiesAttribute.array[i3+1] += (Math.random() - 0.5) * 0.001;
        // velocitiesAttribute.array[i3+2] += (Math.random() - 0.5) * 0.001;
        // Apply velocity and damping (if using velocities)
        // positionsAttribute.array[i3] += velocitiesAttribute.array[i3];
        // ... apply velocity to y, z ...
        // velocitiesAttribute.array[i3] *= 0.98; // Damping
        // ... damp y, z ...

    }

    positionsAttribute.needsUpdate = true;
    colorsAttribute.needsUpdate = true;
    // velocitiesAttribute.needsUpdate = true; // If using velocities

    // Overall rotation of the particle system can be done here or in the main loop via group.rotation
    // particles.rotation.y += cfg.rotationSpeed; // Can cause issues if particles calculated relative to initial angle
    group.rotation.y += cfg.rotationSpeed * (1 + overallAvg * 0.5); // Rotate group itself, speed influenced by audio

    // Adjust overall particle size/opacity based on average volume
    particles.material.size = cfg.particleSize * (1 + overallAvg * 0.5);
    particles.material.opacity = 0.6 + overallAvg * 0.4;

}