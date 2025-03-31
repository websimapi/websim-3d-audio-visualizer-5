import * as THREE from 'three';
import { config } from 'config';

// Terrain visualization
function createTerrainVisualization() {
    const group = new THREE.Group();
    
    // Main terrain with increased detail
    const geometry = new THREE.PlaneGeometry(
        config.terrain.size,
        config.terrain.size,
        config.terrain.segments - 1,
        config.terrain.segments - 1
    );
    
    geometry.rotateX(-Math.PI / 2);
    
    const positions = geometry.attributes.position.array;
    
    // Store original vertices for distortion
    const originalVertices = [];
    for (let i = 0; i < geometry.attributes.position.array.length; i += 3) {
        originalVertices.push(
            new THREE.Vector3(
                geometry.attributes.position.array[i],
                geometry.attributes.position.array[i + 1],
                geometry.attributes.position.array[i + 2]
            )
        );
    }
    
    // Vertex colors for enhanced gradient effect
    const colors = [];
    const positionsForColors = geometry.attributes.position.array;
    
    for (let i = 0; i < positionsForColors.length; i += 3) {
        const y = positionsForColors[i + 1];
        
        // Get a color between color1 and color2 based on height
        const color = new THREE.Color(config.terrain.color1);
        color.lerp(new THREE.Color(config.terrain.color2), (y + 10) / 20);
        
        colors.push(color.r, color.g, color.b);
    }
    
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    // Enhanced material
    const material = new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        shininess: 80,
        side: THREE.DoubleSide,
        metalness: 0.2,
        roughness: 0.8,
        clearcoat: 0.4,
        clearcoatRoughness: 0.2
    });
    
    const terrain = new THREE.Mesh(geometry, material);
    terrain.userData = { originalPositions: originalVertices };
    group.add(terrain);
    
    // Add gridlines for a more technical look
    const gridGeometry = new THREE.PlaneGeometry(
        config.terrain.size * 1.2,
        config.terrain.size * 1.2,
        20,
        20
    );
    gridGeometry.rotateX(-Math.PI / 2);
    
    const gridMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        wireframe: true,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending
    });
    
    const grid = new THREE.Mesh(gridGeometry, gridMaterial);
    grid.position.y = -2;
    group.add(grid);
    
    // Add reflection plane
    const reflectionGeometry = new THREE.PlaneGeometry(
        config.terrain.size * 1.5,
        config.terrain.size * 1.5
    );
    reflectionGeometry.rotateX(-Math.PI / 2);
    
    const reflectionMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending
    });
    
    const reflection = new THREE.Mesh(reflectionGeometry, reflectionMaterial);
    reflection.position.y = -5;
    group.add(reflection);
    
    // Add atmospheric fog particles with improved distribution
    const fogGeometry = new THREE.BufferGeometry();
    const fogCount = 800;
    const fogPositions = new Float32Array(fogCount * 3);
    const fogSizes = new Float32Array(fogCount);
    const fogColors = new Float32Array(fogCount * 3);
    
    for (let i = 0; i < fogCount; i++) {
        // More even distribution over the terrain
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * config.terrain.size * 0.75;
        
        fogPositions[i * 3] = Math.cos(angle) * radius;
        fogPositions[i * 3 + 1] = Math.random() * 25; // Higher fog
        fogPositions[i * 3 + 2] = Math.sin(angle) * radius;
        
        // Random sizes
        fogSizes[i] = 1 + Math.random() * 3;
        
        // Color based on height for layered effect
        const heightRatio = fogPositions[i * 3 + 1] / 25;
        const color = new THREE.Color().setHSL(0.6 + heightRatio * 0.2, 0.8, 0.5);
        fogColors[i * 3] = color.r;
        fogColors[i * 3 + 1] = color.g;
        fogColors[i * 3 + 2] = color.b;
    }
    
    fogGeometry.setAttribute('position', new THREE.BufferAttribute(fogPositions, 3));
    fogGeometry.setAttribute('size', new THREE.BufferAttribute(fogSizes, 1));
    fogGeometry.setAttribute('color', new THREE.BufferAttribute(fogColors, 3));
    
    const fogMaterial = new THREE.PointsMaterial({
        size: 2,
        vertexColors: true,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending
    });
    
    const fog = new THREE.Points(fogGeometry, fogMaterial);
    fog.userData = { positions: fogPositions.slice(), sizes: fogSizes.slice() };
    group.add(fog);
    
    // Add subtle light pillars
    for (let i = 0; i < 5; i++) {
        const pillarGeometry = new THREE.CylinderGeometry(0.5, 0.5, 50, 8, 1, true);
        const pillarMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        
        const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
        
        // Position randomly on the terrain
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * config.terrain.size * 0.4;
        pillar.position.set(
            Math.cos(angle) * distance,
            25, // Pillar height
            Math.sin(angle) * distance
        );
        
        pillar.userData = {
            originalOpacity: 0.15,
            pulseSpeed: 0.5 + Math.random() * 0.5
        };
        
        group.add(pillar);
    }
    
    return group;
}

function updateTerrainVisualization(activeVisualization, dataArray, sensitivity) {
    // Get terrain mesh 
    const terrain = activeVisualization.children[0];
    const grid = activeVisualization.children[1];
    const reflection = activeVisualization.children[2];
    const fog = activeVisualization.children[3];
    
    const positions = terrain.geometry.attributes.position;
    const colors = terrain.geometry.attributes.color;
    const originalPositions = terrain.userData.originalPositions;
    
    // Get light pillars
    const pillars = activeVisualization.children.slice(4);
    
    // Audio frequencies will drive terrain height with more complex patterns
    for (let i = 0; i < positions.count; i++) {
        const vertex = originalPositions[i];
        
        // Create wave patterns
        const xPos = (vertex.x + config.terrain.size/2) / config.terrain.size; // 0 to 1
        const zPos = (vertex.z + config.terrain.size/2) / config.terrain.size; // 0 to 1
        
        // Calculate ripple pattern
        const time = Date.now() * 0.001;
        const distance = Math.sqrt(
            Math.pow(xPos - 0.5, 2) + 
            Math.pow(zPos - 0.5, 2)
        );
        
        // Ripple frequency based on distance from center
        const ripple = Math.sin(distance * 10 - time * 2) * 0.1;
        
        // Calculate index with different wave patterns combined
        const frequencyIndex = Math.floor(
            ((xPos * 0.4 + zPos * 0.4 + Math.sin(time) * 0.1) * dataArray.length + 
            ripple * dataArray.length)
        ) % dataArray.length;
        
        // Calculate height based on frequency data with ripple effect
        const frequency = dataArray[frequencyIndex] / 255.0;
        const height = frequency * config.terrain.amplitude * sensitivity;
        
        // Apply new height with smoother transitions
        positions.setY(i, vertex.y + height + ripple * 3);
        
        // Enhanced color gradients based on height and audio
        const hue = 0.6 + (frequency * 0.3 + ripple * 0.1) % 0.4; // Blue to purple range
        const saturation = 0.7 + frequency * 0.3;
        const lightness = 0.3 + frequency * 0.5;
        
        const color = new THREE.Color().setHSL(hue, saturation, lightness);
        colors.setXYZ(i, color.r, color.g, color.b);
    }
    
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    
    // Update grid based on audio
    const lowFrequencies = dataArray.slice(0, 10).reduce((sum, val) => sum + val, 0) / (10 * 255);
    grid.material.opacity = 0.1 + lowFrequencies * 0.2;
    
    // Wave effect on grid
    grid.position.y = -2 + Math.sin(Date.now() * 0.001) * 0.5 * lowFrequencies;
    
    // Update reflection material based on average frequency
    const averageFrequency = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length / 255;
    reflection.material.opacity = 0.2 + averageFrequency * 0.5;
    
    // Color shift for reflection
    const reflectionHue = (Date.now() * 0.0001 + averageFrequency * 0.3) % 1.0;
    reflection.material.color.setHSL(reflectionHue, 0.8, 0.3 + averageFrequency * 0.3);
    
    // Animate fog particles
    const fogPositions = fog.geometry.attributes.position;
    const fogSizes = fog.geometry.attributes.size;
    const originalFogPositions = fog.userData.positions;
    const originalFogSizes = fog.userData.sizes;
    
    for (let i = 0; i < fogPositions.count; i++) {
        const idx = i % dataArray.length;
        const frequencyValue = dataArray[idx] / 255.0;
        
        // Get original position
        const origX = originalFogPositions[i * 3];
        const origY = originalFogPositions[i * 3 + 1];
        const origZ = originalFogPositions[i * 3 + 2];
        
        // Add complex movement
        const time = Date.now() * 0.0005;
        const offsetX = Math.sin(time + i * 0.1) * 2;
        const offsetY = Math.cos(time + i * 0.1) * frequencyValue * 8;
        const offsetZ = Math.sin(time * 0.8 + i * 0.1) * 2;
        
        // Rise effect for particles based on audio
        const rise = Math.max(0, frequencyValue - 0.5) * 10;
        
        fogPositions.setXYZ(i, 
            origX + offsetX, 
            origY + offsetY + rise, 
            origZ + offsetZ
        );
        
        // Update particle size based on audio
        fogSizes.setX(i, originalFogSizes[i] * (0.8 + frequencyValue * 1.5));
    }
    
    fogPositions.needsUpdate = true;
    fogSizes.needsUpdate = true;
    fog.material.opacity = 0.15 + averageFrequency * 0.4;
    
    // Update light pillars
    pillars.forEach((pillar, index) => {
        // Use different frequency bands for each pillar
        const freqIdx = Math.floor(index * dataArray.length / pillars.length);
        const freqValue = dataArray[freqIdx] / 255.0;
        
        // Pulse effect
        const time = Date.now() * 0.001;
        const pulse = Math.sin(time * pillar.userData.pulseSpeed) * 0.5 + 0.5;
        
        // Update opacity based on audio and pulse
        pillar.material.opacity = pillar.userData.originalOpacity + freqValue * 0.2 + pulse * 0.1;
        
        // Color shift based on audio
        const hue = (0.6 + freqValue * 0.2) % 1.0;
        pillar.material.color.setHSL(hue, 0.9, 0.6);
        
        // Scale effect
        pillar.scale.x = pillar.scale.z = 0.8 + freqValue * 1.0 + pulse * 0.5;
    });
    
    // Slowly rotate terrain for additional effect
    activeVisualization.rotation.y += 0.001;
}

export { createTerrainVisualization, updateTerrainVisualization };