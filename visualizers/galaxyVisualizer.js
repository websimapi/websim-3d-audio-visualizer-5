import * as THREE from 'three';

export function createGalaxyVisualization() {
    const group = new THREE.Group();
    
    // Parameters
    const params = {
        count: 10000,
        size: 0.01,
        radius: 80,
        branches: 5,
        spin: 1,
        randomness: 0.2,
        randomnessPower: 3,
        insideColor: 0xff6030,
        outsideColor: 0x1b3984,
        
        // For audio reactivity
        maxDistortion: 20
    };
    
    // Galaxy geometry
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(params.count * 3);
    const colors = new Float32Array(params.count * 3);
    const originalPositions = new Float32Array(params.count * 3);
    
    const colorInside = new THREE.Color(params.insideColor);
    const colorOutside = new THREE.Color(params.outsideColor);

    for (let i = 0; i < params.count; i++) {
        const i3 = i * 3;
        
        // Position
        const radius = Math.random() * params.radius;
        const spinAngle = radius * params.spin;
        const branchAngle = (i % params.branches) / params.branches * Math.PI * 2;
        
        const randomX = Math.pow(Math.random(), params.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * params.randomness * radius;
        const randomY = Math.pow(Math.random(), params.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * params.randomness * radius;
        const randomZ = Math.pow(Math.random(), params.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * params.randomness * radius;
        
        positions[i3] = Math.cos(branchAngle + spinAngle) * radius + randomX;
        positions[i3 + 1] = randomY;
        positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;
        
        // Store original positions for audio reactivity
        originalPositions[i3] = positions[i3];
        originalPositions[i3 + 1] = positions[i3 + 1];
        originalPositions[i3 + 2] = positions[i3 + 2];
        
        // Color
        const mixedColor = colorInside.clone();
        mixedColor.lerp(colorOutside, radius / params.radius);
        
        colors[i3] = mixedColor.r;
        colors[i3 + 1] = mixedColor.g;
        colors[i3 + 2] = mixedColor.b;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // Material
    const material = new THREE.PointsMaterial({
        size: params.size,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true
    });
    
    // Points
    const points = new THREE.Points(geometry, material);
    points.userData = { originalPositions };
    group.add(points);
    
    // Add a central glow
    const glowGeometry = new THREE.SphereGeometry(3, 32, 32);
    const glowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            glowColor: { value: new THREE.Color(0xffff00) },
            viewVector: { value: new THREE.Vector3(0, 0, 1) }
        },
        vertexShader: `
            uniform vec3 viewVector;
            varying float intensity;
            void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                vec3 actual_normal = normalize(normalMatrix * normal);
                intensity = pow(0.7 - dot(actual_normal, viewVector), 2.0);
            }
        `,
        fragmentShader: `
            uniform vec3 glowColor;
            varying float intensity;
            void main() {
                vec3 glow = glowColor * intensity;
                gl_FragColor = vec4(glow, 1.0);
            }
        `,
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
        transparent: true
    });
    
    const glowSphere = new THREE.Mesh(glowGeometry, glowMaterial);
    group.add(glowSphere);
    
    // Add surrounding dust
    const dustGeometry = new THREE.BufferGeometry();
    const dustCount = 2000;
    const dustPositions = new Float32Array(dustCount * 3);
    
    for (let i = 0; i < dustCount * 3; i += 3) {
        const radius = params.radius * (1 + Math.random());
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        dustPositions[i] = radius * Math.sin(phi) * Math.cos(theta);
        dustPositions[i+1] = radius * Math.sin(phi) * Math.sin(theta);
        dustPositions[i+2] = radius * Math.cos(phi);
    }
    
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    
    const dustMaterial = new THREE.PointsMaterial({
        color: 0xaaaaaa,
        size: 0.1,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
    });
    
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    dust.userData = { originalPositions: dustPositions.slice() };
    group.add(dust);
    
    return group;
}

export function updateGalaxyVisualization(visualizer, dataArray, sensitivity) {
    const galaxy = visualizer.children[0];
    const positions = galaxy.geometry.attributes.position;
    const originalPositions = galaxy.userData.originalPositions;
    const centralGlow = visualizer.children[1];
    const dust = visualizer.children[2];
    
    // Calculate overall energy for central glow
    const averageFrequency = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
    const normalizedAvg = averageFrequency / 255.0;
    
    // Pulse the central glow based on bass
    const bassValue = (dataArray[0] + dataArray[1] + dataArray[2]) / (3 * 255);
    centralGlow.scale.set(
        1 + bassValue * 2,
        1 + bassValue * 2,
        1 + bassValue * 2
    );
    
    // Change color based on frequency
    centralGlow.material.uniforms.glowColor.value.setHSL(bassValue * 0.3, 1.0, 0.5);
    
    // Distort galaxy based on audio
    for (let i = 0; i < positions.count; i++) {
        const i3 = i * 3;
        
        // Get audio frequency for this point
        const idx = i % dataArray.length;
        const frequencyValue = dataArray[idx] / 255.0;
        
        // Calculate distance from center
        const originalPos = new THREE.Vector3(
            originalPositions[i3],
            originalPositions[i3 + 1],
            originalPositions[i3 + 2]
        );
        
        const distanceFromCenter = originalPos.length();
        
        // Normalize direction
        const direction = originalPos.clone().normalize();
        
        // Calculate displacement based on audio and distance
        const displacement = frequencyValue * sensitivity * 10.0 * (1.0 - distanceFromCenter / 100.0);
        
        // Apply displacement
        const newPos = originalPos.clone().add(
            direction.multiplyScalar(displacement)
        );
        
        positions.setXYZ(i, newPos.x, newPos.y, newPos.z);
    }
    
    positions.needsUpdate = true;
    
    // Animate dust particles
    const dustPositions = dust.geometry.attributes.position;
    const originalDustPositions = dust.userData.originalPositions;
    
    for (let i = 0; i < dustPositions.count; i++) {
        const i3 = i * 3;
        const idx = i % dataArray.length;
        const frequencyValue = dataArray[idx] / 255.0;
        
        // Original positions
        const origX = originalDustPositions[i3];
        const origY = originalDustPositions[i3 + 1];
        const origZ = originalDustPositions[i3 + 2];
        
        // Create pulse effect
        const time = Date.now() * 0.0001;
        const pulseScale = 1 + frequencyValue * sensitivity * 0.2;
        
        dustPositions.setXYZ(
            i, 
            origX * pulseScale + Math.sin(time * i * 0.01) * 2,
            origY * pulseScale + Math.cos(time * i * 0.01) * 2,
            origZ * pulseScale + Math.sin(time * i * 0.01 + 2) * 2
        );
    }
    
    dustPositions.needsUpdate = true;
    dust.material.opacity = 0.2 + normalizedAvg * 0.3;
    
    // Rotate the galaxy
    visualizer.rotation.y += 0.001;
    visualizer.rotation.z += 0.0005;
}