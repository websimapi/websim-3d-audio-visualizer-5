import * as THREE from 'three';
import { config } from 'config';

// Sphere visualization
function createSphereVisualization() {
    const group = new THREE.Group();
    
    // Main sphere with higher detail level
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
    
    // Enhanced material with bloom effect
    const material = new THREE.MeshPhysicalMaterial({
        color: config.sphere.color1,
        emissive: config.sphere.color2,
        emissiveIntensity: 0.5,
        metalness: 0.8,
        roughness: 0.2,
        clearcoat: 0.8,
        clearcoatRoughness: 0.2,
        transparent: true,
        opacity: 0.9
    });
    
    const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.15
    });
    
    const sphere = new THREE.Mesh(geometry, material);
    const wireframe = new THREE.Mesh(geometry, wireframeMaterial);
    
    sphere.add(wireframe);
    sphere.userData = { originalPositions };
    group.add(sphere);
    
    // Add volumetric light rays
    const rayCount = 8;
    for (let i = 0; i < rayCount; i++) {
        const rayGeometry = new THREE.CylinderGeometry(0, 5, 80, 8, 1, true);
        
        const rayMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(i/rayCount, 0.8, 0.5),
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        
        const ray = new THREE.Mesh(rayGeometry, rayMaterial);
        ray.position.set(0, 0, 0);
        ray.userData = { 
            rotationSpeed: 0.01 + (i/rayCount) * 0.01, 
            initialAngle: i * (Math.PI * 2 / rayCount)
        };
        
        // Initial rotation
        ray.rotation.x = Math.PI / 2;
        ray.rotation.z = ray.userData.initialAngle;
        group.add(ray);
    }
    
    // Add orbital rings with more detail
    for (let i = 0; i < 4; i++) {
        const ringGeometry = new THREE.TorusGeometry(
            config.sphere.radius * (1.2 + i * 0.3), 
            0.5 - i * 0.05, 
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
        ring.userData = { 
            rotationSpeed: 0.002 + i * 0.001, 
            originalRotation: ring.rotation.clone(),
            pulseSpeed: 0.02 + i * 0.01
        };
        group.add(ring);
        
        // Add small orbiting particles for each ring
        const particleCount = 20;
        for (let j = 0; j < particleCount; j++) {
            const particleGeo = new THREE.SphereGeometry(0.5, 8, 8);
            const particleMat = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(i * 0.2, 1, 0.7),
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending
            });
            
            const particle = new THREE.Mesh(particleGeo, particleMat);
            const angle = (j / particleCount) * Math.PI * 2;
            const radius = config.sphere.radius * (1.2 + i * 0.3);
            
            particle.position.x = Math.cos(angle) * radius;
            particle.position.z = Math.sin(angle) * radius;
            particle.userData = { 
                angle: angle,
                speed: 0.01 + Math.random() * 0.02,
                radius: radius,
                originalOpacity: 0.8
            };
            
            ring.add(particle);
        }
    }
    
    // Add improved ambient particles
    const particlesGeometry = new THREE.BufferGeometry();
    const particleCount = 1500;
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const colors = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < positions.length; i += 3) {
        const radius = config.sphere.radius * (2 + Math.random() * 2);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        positions[i] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i+1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i+2] = radius * Math.cos(phi);
        
        // Random size for each particle
        sizes[i/3] = 0.5 + Math.random() * 1.5;
        
        // Color gradient based on distance
        const distRatio = radius / (config.sphere.radius * 4);
        const color = new THREE.Color().setHSL(distRatio * 0.3 + 0.6, 0.8, 0.5);
        colors[i] = color.r;
        colors[i+1] = color.g;
        colors[i+2] = color.b;
    }
    
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // Custom shader material for particles
    const particlesMaterial = new THREE.PointsMaterial({
        size: 1.0,
        transparent: true,
        opacity: 0.6,
        vertexColors: true,
        blending: THREE.AdditiveBlending
    });
    
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    particles.userData = { originalPositions: [...positions], originalSizes: [...sizes] };
    group.add(particles);
    
    return group;
}

function updateSphereVisualization(activeVisualization, dataArray, sensitivity) {
    // Process main sphere
    const sphere = activeVisualization.children[0];
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
    
    // Pulse color based on bass
    const bassValue = (dataArray[0] + dataArray[1] + dataArray[2]) / (3 * 255);
    sphere.material.color.setHSL(bassValue * 0.2 + 0.5, 0.8, 0.5 + bassValue * 0.3);
    
    // Process volumetric light rays
    const rayCount = 8;
    for (let i = 1; i <= rayCount; i++) {
        const ray = activeVisualization.children[i];
        
        // Get mid-frequency data for rays
        const midFreqIdx = Math.floor(dataArray.length * 0.5) + i;
        const midFrequency = dataArray[midFreqIdx % dataArray.length] / 255.0;
        
        // Update ray properties
        ray.scale.y = 0.8 + midFrequency * 1.5;
        ray.material.opacity = 0.05 + midFrequency * 0.2;
        
        // Rotate the ray based on its properties
        ray.rotation.z += ray.userData.rotationSpeed * (1 + bassValue * 2);
    }
    
    // Process orbital rings
    for (let i = 0; i < 4; i++) {
        const ringIdx = i + rayCount + 1;
        const ring = activeVisualization.children[ringIdx];
        
        // Get different frequency ranges for each ring
        const freqRangeStart = Math.floor(dataArray.length * (i/4));
        const freqRangeEnd = Math.floor(dataArray.length * ((i+1)/4));
        const rangeAvg = dataArray.slice(freqRangeStart, freqRangeEnd)
                               .reduce((sum, val) => sum + val, 0) / (freqRangeEnd - freqRangeStart) / 255;
        
        // Update ring rotation
        ring.rotation.x += ring.userData.rotationSpeed * (1 + rangeAvg * 2);
        ring.rotation.z += ring.userData.rotationSpeed * 0.7;
        
        // Pulse the ring
        const time = Date.now() * 0.001;
        const pulseFactor = 1 + Math.sin(time * ring.userData.pulseSpeed) * 0.1 * rangeAvg;
        ring.scale.set(pulseFactor, pulseFactor, pulseFactor);
        
        // Update opacity and color based on audio
        ring.material.opacity = 0.2 + rangeAvg * 0.8;
        const hue = (i * 0.2 + rangeAvg * 0.3) % 1.0;
        ring.material.color.setHSL(hue, 1, 0.5 + rangeAvg * 0.3);
        
        // Update orbiting particles
        for (let j = 0; j < ring.children.length; j++) {
            const particle = ring.children[j];
            
            // Update particle position
            particle.userData.angle += particle.userData.speed * (1 + rangeAvg * 3);
            particle.position.x = Math.cos(particle.userData.angle) * particle.userData.radius;
            particle.position.z = Math.sin(particle.userData.angle) * particle.userData.radius;
            
            // Pulse particle size based on audio
            const particleScale = 0.8 + rangeAvg * 1.5;
            particle.scale.set(particleScale, particleScale, particleScale);
            
            // Update particle opacity and color
            particle.material.opacity = particle.userData.originalOpacity * (0.5 + rangeAvg * 0.8);
            particle.material.color.setHSL(hue, 1, 0.7 + rangeAvg * 0.3);
        }
    }
    
    // Update particles
    const particles = activeVisualization.children[activeVisualization.children.length - 1];
    const particlePositions = particles.geometry.attributes.position;
    const particleSizes = particles.geometry.attributes.size;
    const originalPositions = particles.userData.originalPositions;
    const originalSizes = particles.userData.originalSizes;
    
    // Animate particles based on frequency bands
    for (let i = 0; i < particlePositions.count; i++) {
        // Distribute particles across frequency spectrum
        const idx = Math.floor((i / particlePositions.count) * dataArray.length);
        const frequencyValue = dataArray[idx] / 255.0;
        
        // Get original position
        const x = originalPositions[i * 3];
        const y = originalPositions[i * 3 + 1];
        const z = originalPositions[i * 3 + 2];
        
        // Calculate direction vector from center
        const dir = new THREE.Vector3(x, y, z).normalize();
        
        // Push particles outward based on frequency
        const distortionAmount = frequencyValue * 30 * sensitivity;
        const newPos = new THREE.Vector3(x, y, z).add(
            dir.multiplyScalar(distortionAmount)
        );
        
        // Apply new position with added turbulence
        const time = Date.now() * 0.0005;
        const turbulence = 2 * Math.sin(time + i);
        particlePositions.setXYZ(
            i, 
            newPos.x + turbulence * frequencyValue,
            newPos.y + turbulence * frequencyValue,
            newPos.z + turbulence * frequencyValue
        );
        
        // Update particle size
        particleSizes.setX(i, originalSizes[i] * (1 + frequencyValue * 2));
    }
    
    particlePositions.needsUpdate = true;
    particleSizes.needsUpdate = true;
    particles.material.opacity = 0.3 + normalizedAvg * 0.7;
    
    // Rotate the entire visualization
    activeVisualization.rotation.y += 0.001;
    activeVisualization.rotation.x += 0.0005 * Math.sin(Date.now() * 0.001);
}

export { createSphereVisualization, updateSphereVisualization };