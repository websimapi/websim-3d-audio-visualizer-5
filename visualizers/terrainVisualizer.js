import * as THREE from 'three';
import { config } from 'config';

export function createTerrainVisualization() {
    const group = new THREE.Group();
    
    // Main terrain
    const geometry = new THREE.PlaneGeometry(
        config.terrain.size,
        config.terrain.size,
        config.terrain.segments - 1,
        config.terrain.segments - 1
    );
    
    geometry.rotateX(-Math.PI / 2);
    
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
    
    // Vertex colors for gradient effect
    const colors = [];
    const positions = geometry.attributes.position.array;
    
    for (let i = 0; i < positions.length; i += 3) {
        const y = positions[i + 1];
        
        // Get a color between color1 and color2 based on height
        const color = new THREE.Color(config.terrain.color1);
        color.lerp(new THREE.Color(config.terrain.color2), (y + 10) / 20);
        
        colors.push(color.r, color.g, color.b);
    }
    
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    const material = new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        shininess: 80,
        side: THREE.DoubleSide,
        metalness: 0.2,
        roughness: 0.8,
        clearcoat: 0.3
    });
    
    const terrain = new THREE.Mesh(geometry, material);
    terrain.userData = { originalPositions };
    group.add(terrain);
    
    // Add water reflection plane
    const reflectionGeometry = new THREE.PlaneGeometry(
        config.terrain.size * 1.5,
        config.terrain.size * 1.5
    );
    reflectionGeometry.rotateX(-Math.PI / 2);
    
    // Create dynamic water shader material
    const waterMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color: { value: new THREE.Color(0x0044ff) },
            amplitude: { value: 0.3 }
        },
        vertexShader: `
            uniform float time;
            uniform float amplitude;
            varying vec2 vUv;
            
            void main() {
                vUv = uv;
                vec3 newPosition = position;
                newPosition.y += sin(position.x * 0.05 + time) * sin(position.z * 0.05 + time) * amplitude;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform float time;
            varying vec2 vUv;
            
            void main() {
                float intensity = 0.5 + 0.5 * sin(vUv.x * 10.0 + time) * sin(vUv.y * 10.0 + time);
                vec3 finalColor = color * intensity;
                gl_FragColor = vec4(finalColor, 0.6);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending
    });
    
    const waterSurface = new THREE.Mesh(reflectionGeometry, waterMaterial);
    waterSurface.position.y = -5;
    group.add(waterSurface);
    
    // Add atmospheric fog particles
    const fogGeometry = new THREE.BufferGeometry();
    const fogCount = 500;
    const fogPositions = new Float32Array(fogCount * 3);
    
    for (let i = 0; i < fogPositions.length; i += 3) {
        fogPositions[i] = (Math.random() - 0.5) * config.terrain.size * 1.5;
        fogPositions[i+1] = Math.random() * 15;
        fogPositions[i+2] = (Math.random() - 0.5) * config.terrain.size * 1.5;
    }
    
    fogGeometry.setAttribute('position', new THREE.BufferAttribute(fogPositions, 3));
    
    const fogMaterial = new THREE.PointsMaterial({
        size: 2,
        color: new THREE.Color(config.terrain.color1),
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending
    });
    
    const fog = new THREE.Points(fogGeometry, fogMaterial);
    fog.userData = { positions: fogPositions.slice() };
    group.add(fog);
    
    return group;
}

export function updateTerrainVisualization(visualizer, dataArray, sensitivity) {
    // Get terrain mesh 
    const terrain = visualizer.children[0];
    const positions = terrain.geometry.attributes.position;
    const colors = terrain.geometry.attributes.color;
    const originalPositions = terrain.userData.originalPositions;
    
    // Get water surface
    const waterSurface = visualizer.children[1];
    
    // Get fog particles
    const fog = visualizer.children[2];
    const fogPositions = fog.geometry.attributes.position;
    const originalFogPositions = fog.userData.positions;
    
    // Update water animation
    waterSurface.material.uniforms.time.value += 0.01;
    
    // Audio frequencies will drive terrain height
    for (let i = 0; i < positions.count; i++) {
        const vertex = originalPositions[i];
        
        // Map the vertex to an audio frequency
        // Use X and Z position to determine which frequency to sample
        const x = (vertex.x + config.terrain.size/2) / config.terrain.size; // 0 to 1
        const z = (vertex.z + config.terrain.size/2) / config.terrain.size; // 0 to 1
        
        // Calculate index based on position with wave pattern
        const frequencyIndex = Math.floor((x * 0.5 + z * 0.5 + Math.sin(Date.now() * 0.001) * 0.1) * (dataArray.length - 1));
        
        // Calculate height based on frequency data
        const frequency = dataArray[frequencyIndex] / 255.0;
        const height = frequency * config.terrain.amplitude * sensitivity;
        
        // Apply new height
        positions.setY(i, vertex.y + height);
        
        // Update color based on height with more vibrant gradient
        const color = new THREE.Color();
        color.setHSL((frequency * 0.3 + 0.6) % 1.0, 0.8, 0.4 + frequency * 0.4);
        
        colors.setXYZ(i, color.r, color.g, color.b);
    }
    
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    
    // Update water material based on average frequency
    const averageFrequency = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length / 255;
    waterSurface.material.uniforms.amplitude.value = 0.3 + averageFrequency * 1.5;
    waterSurface.material.uniforms.color.value.setHSL(0.6, 0.8, averageFrequency * 0.5);
    
    // Animate fog particles
    for (let i = 0; i < fogPositions.count; i++) {
        const idx = i % dataArray.length;
        const frequencyValue = dataArray[idx] / 255.0;
        
        // Get original position
        const origX = originalFogPositions[i * 3];
        const origY = originalFogPositions[i * 3 + 1];
        const origZ = originalFogPositions[i * 3 + 2];
        
        // Add subtle movement
        const time = Date.now() * 0.0005;
        const offsetX = Math.sin(time + i * 0.1) * 2;
        const offsetY = Math.cos(time + i * 0.1) * frequencyValue * 5;
        const offsetZ = Math.sin(time * 0.8 + i * 0.1) * 2;
        
        fogPositions.setXYZ(i, origX + offsetX, origY + offsetY, origZ + offsetZ);
    }
    
    fogPositions.needsUpdate = true;
    fog.material.opacity = 0.1 + averageFrequency * 0.3;
    
    // Slowly rotate terrain for additional effect
    visualizer.rotation.y += 0.001;
}