import * as THREE from 'three';
import { config } from '../config';

export function createSphereVisualization() {
    const group = new THREE.Group();
    
    // Main sphere
    const geometry = new THREE.IcosahedronGeometry(
        config.sphere.radius, 
        Math.min(6, config.sphere.segments)
    );
    
    // Store original vertices for distortion
    const originalPositions = [];
    for (let i = 0; i < geometry.attributes.position.array.length; i += 3) {
        originalPositions.push(
            new THREE.Vector3(
                geometry.attributes.position.array[i],
                geometry.attributes.position.array[i + 1],
                geometry.attributes.position.array[i + 2]
            )
        );
    }
    
    // Create material with custom shader
    const material = new THREE.MeshPhysicalMaterial({
        color: config.sphere.color1,
        emissive: config.sphere.color2,
        emissiveIntensity: 0.5,
        metalness: 0.8,
        roughness: 0.2,
        clearcoat: 0.5,
        clearcoatRoughness: 0.3,
        transparent: true,
        opacity: 0.9
    });
    
    const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.15
    });
    
    // Enhanced with glow material
    const sphereGlowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            glowColor: { value: new THREE.Color(config.sphere.color2) },
            coeficient: { value: 1.0 },
            power: { value: 2.0 }
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vPosition;
            
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 glowColor;
            uniform float coeficient;
            uniform float power;
            
            varying vec3 vNormal;
            varying vec3 vPosition;
            
            void main() {
                float intensity = pow(coeficient - dot(vNormal, normalize(vPosition)), power);
                gl_FragColor = vec4(glowColor, intensity);
            }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true
    });
    
    const sphere = new THREE.Mesh(geometry, material);
    const wireframe = new THREE.Mesh(geometry, wireframeMaterial);
    
    // Add glow effect
    const glowSphere = new THREE.Mesh(
        new THREE.SphereGeometry(config.sphere.radius * 1.2, 32, 32),
        sphereGlowMaterial
    );
    
    sphere.add(wireframe);
    sphere.userData = { originalPositions };
    group.add(sphere);
    group.add(glowSphere);
    
    // Add orbital rings
    for (let i = 0; i < 3; i++) {
        const ringGeometry = new THREE.TorusGeometry(
            config.sphere.radius * (1.2 + i * 0.3), 
            0.5, 
            16, 
            100
        );
        
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(i * 0.2, 1, 0.5),
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2 + i * Math.PI / 4;
        ring.rotation.y = i * Math.PI / 3;
        ring.userData = { rotationSpeed: 0.002 + i * 0.001, originalRotation: ring.rotation.clone() };
        group.add(ring);
    }
    
    // Add ambient particles
    const particlesGeometry = new THREE.BufferGeometry();
    const particleCount = 1000;
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < positions.length; i += 3) {
        const radius = config.sphere.radius * (2 + Math.random() * 2);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        positions[i] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i+1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i+2] = radius * Math.cos(phi);
    }
    
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const particlesMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.8,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending
    });
    
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    particles.userData = { originalPositions: [...positions] };
    group.add(particles);
    
    return group;
}

export function updateSphereVisualization(visualizer, dataArray, sensitivity) {
    // Process main sphere
    const sphere = visualizer.children[0];
    const glowSphere = visualizer.children[1];
    const positions = sphere.geometry.attributes.position;
    const originalPositions = sphere.userData.originalPositions;
    
    // Use FFT data to distort sphere
    for (let i = 0; i < positions.count; i++) {
        const vertex = originalPositions[i];
        const idx = i % (dataArray.length - 1);
        
        // Normalize direction vector
        const direction = new THREE.Vector3().copy(vertex).normalize();
        
        // Calculate distortion amount based on audio data
        const frequency = dataArray[idx] / 255.0;
        const distortionAmount = frequency * config.sphere.maxDistortion * sensitivity;
        
        // Apply distortion in the vertex normal direction
        const newPos = new THREE.Vector3().copy(vertex).add(
            direction.multiplyScalar(distortionAmount)
        );
        
        positions.setXYZ(i, newPos.x, newPos.y, newPos.z);
    }
    
    positions.needsUpdate = true;
    
    // Update material colors based on overall audio volume
    const averageFrequency = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
    const normalizedAvg = averageFrequency / 255.0;
    
    sphere.material.emissiveIntensity = 0.2 + normalizedAvg * 0.8;
    
    // Update glow effect based on bass
    const bassValue = (dataArray[0] + dataArray[1] + dataArray[2]) / (3 * 255);
    glowSphere.material.uniforms.power.value = 2.0 - bassValue;
    glowSphere.material.uniforms.coeficient.value = 1.0 + bassValue * 0.5;
    glowSphere.scale.set(1 + bassValue * 0.3, 1 + bassValue * 0.3, 1 + bassValue * 0.3);
    
    // Process orbital rings - adapt based on bass frequencies
    for (let i = 2; i <= 4; i++) {
        const ring = visualizer.children[i];
        
        // Update ring rotation
        ring.rotation.x += ring.userData.rotationSpeed * (1 + bassValue);
        ring.rotation.z += ring.userData.rotationSpeed * 0.5;
        
        // Update opacity based on audio
        ring.material.opacity = 0.2 + bassValue * 0.8;
        
        // Update color
        const hue = (i * 0.2 + bassValue * 0.2) % 1.0;
        ring.material.color.setHSL(hue, 1, 0.5);
    }
    
    // Update particles
    const particles = visualizer.children[5];
    const particlePositions = particles.geometry.attributes.position;
    const originalParticlePositions = particles.userData.originalPositions;
    
    // Animate particles based on mid-high frequencies
    for (let i = 0; i < particlePositions.count; i++) {
        const idx = (i % 20) + Math.floor(dataArray.length / 3); // Use mid-range frequencies
        const frequencyValue = dataArray[idx] / 255.0;
        
        // Push particles outward based on frequency
        const offset = frequencyValue * 20 * sensitivity;
        const originalPos = new THREE.Vector3(
            originalParticlePositions[i * 3],
            originalParticlePositions[i * 3 + 1],
            originalParticlePositions[i * 3 + 2]
        );
        
        const direction = originalPos.clone().normalize();
        const newPos = originalPos.clone().add(direction.multiplyScalar(offset));
        
        particlePositions.setXYZ(i, newPos.x, newPos.y, newPos.z);
    }
    
    particlePositions.needsUpdate = true;
    
    // Rotate the entire visualization slowly
    visualizer.rotation.y += 0.001;
}