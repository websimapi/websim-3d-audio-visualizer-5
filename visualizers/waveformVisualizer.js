import * as THREE from 'three';

export function createWaveformVisualization() {
    const group = new THREE.Group();
    
    // Create circular wave structure
    const wavePoints = 512; // Match with time domain data size
    const waveRadius = 60;
    const waveLayers = 5;
    const waveMaterials = [];
    
    for (let layer = 0; layer < waveLayers; layer++) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(wavePoints * 3);
        const layerRadius = waveRadius * (0.6 + layer * 0.1);
        
        // Initialize positions in a circle
        for (let i = 0; i < wavePoints; i++) {
            const angle = (i / wavePoints) * Math.PI * 2;
            const x = Math.cos(angle) * layerRadius;
            const z = Math.sin(angle) * layerRadius;
            const y = 0;
            
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // Create line material with unique color
        const material = new THREE.LineBasicMaterial({
            color: new THREE.Color().setHSL(layer / waveLayers, 1.0, 0.5),
            transparent: true,
            opacity: 0.7 - (layer * 0.1),
            linewidth: 1
        });
        
        waveMaterials.push(material);
        
        // Connect points to form line
        const line = new THREE.Line(geometry, material);
        line.userData = {
            radius: layerRadius,
            layer: layer,
            originalPositions: positions.slice(),
            amplitude: 15 - (layer * 2)
        };
        
        group.add(line);
    }
    
    // Add central sphere
    const coreGeometry = new THREE.IcosahedronGeometry(5, 2);
    const coreMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        emissive: 0x333333,
        metalness: 0.9,
        roughness: 0.1,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.8
    });
    
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    group.add(core);
    
    // Add particles within the wave area
    const particleGeometry = new THREE.BufferGeometry();
    const particleCount = 1000;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleSizes = new Float32Array(particleCount);
    
    for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * waveRadius * 0.9;
        const height = (Math.random() - 0.5) * 50;
        
        particlePositions[i * 3] = Math.cos(angle) * radius;
        particlePositions[i * 3 + 1] = height;
        particlePositions[i * 3 + 2] = Math.sin(angle) * radius;
        
        particleSizes[i] = Math.random() * 2.0;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));
    
    const particleMaterial = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(0xffffff) },
            pointTexture: { value: createCircleTexture() }
        },
        vertexShader: `
            attribute float size;
            varying vec3 vColor;
            void main() {
                vColor = vec3(1.0, 1.0, 1.0);
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform sampler2D pointTexture;
            varying vec3 vColor;
            void main() {
                gl_FragColor = vec4(color * vColor, 1.0);
                gl_FragColor = gl_FragColor * texture2D(pointTexture, gl_PointCoord);
            }
        `,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true
    });
    
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.userData = {
        originalPositions: particlePositions.slice(),
        originalSizes: particleSizes.slice()
    };
    group.add(particles);
    
    return group;
    
    // Helper to create a circle texture for particles
    function createCircleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        
        const context = canvas.getContext('2d');
        context.beginPath();
        context.arc(32, 32, 30, 0, Math.PI * 2);
        context.closePath();
        context.fillStyle = 'white';
        context.fill();
        
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        return texture;
    }
}

export function updateWaveformVisualization(visualizer, dataArray, timeDataArray, sensitivity) {
    // Update waves based on time domain data (waveform)
    const waveLines = visualizer.children.filter(
        child => child.type === 'Line'
    );
    
    // Get core sphere
    const core = visualizer.children[5];
    
    // Get particles
    const particles = visualizer.children[6];
    
    // Calculate overall energy for effects
    const averageFrequency = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
    const normalizedAvg = averageFrequency / 255.0;
    
    // Update core based on bass
    const bassValue = (dataArray[0] + dataArray[1] + dataArray[2]) / (3 * 255);
    core.scale.set(
        1 + bassValue * 0.5,
        1 + bassValue * 0.5,
        1 + bassValue * 0.5
    );
    
    core.material.emissiveIntensity = bassValue * 1.5;
    core.material.color.setHSL(bassValue * 0.3, 1.0, 0.5);
    
    // Update each wave layer
    waveLines.forEach((line, layerIndex) => {
        const positions = line.geometry.attributes.position;
        const originalRadius = line.userData.radius;
        const amplitude = line.userData.amplitude * sensitivity;
        
        // Apply time domain data to wave
        for (let i = 0; i < positions.count; i++) {
            // Get corresponding time domain value
            const timeIndex = Math.floor(i / positions.count * timeDataArray.length);
            const value = (timeDataArray[timeIndex] / 128.0 - 1.0);
            
            // Calculate wave height with layer offset
            const displacement = value * amplitude;
            
            // Get the original angle position
            const angle = (i / positions.count) * Math.PI * 2;
            
            // Calculate position with wave displacement
            // Add phase shift based on layer for visual interest
            const phaseOffset = layerIndex * 0.2 + Date.now() * 0.001;
            const waveOffset = Math.sin(angle * 8 + phaseOffset) * bassValue * amplitude * 0.3;
            
            const radius = originalRadius + displacement + waveOffset;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = displacement * 2; // Vertical displacement
            
            positions.setXYZ(i, x, y, z);
        }
        
        positions.needsUpdate = true;
        
        // Update line color based on audio
        const hue = ((layerIndex / waveLines.length) + normalizedAvg * 0.2) % 1.0;
        line.material.color.setHSL(hue, 0.8, 0.5);
        line.material.opacity = 0.5 + normalizedAvg * 0.5;
    });
    
    // Update particles
    const particlePositions = particles.geometry.attributes.position;
    const particleSizes = particles.geometry.attributes.size;
    const originalPositions = particles.userData.originalPositions;
    const originalSizes = particles.userData.originalSizes;
    
    for (let i = 0; i < particlePositions.count; i++) {
        const i3 = i * 3;
        const timeIndex = i % timeDataArray.length;
        const freqIndex = i % dataArray.length;
        
        // Get values from audio data
        const timeValue = (timeDataArray[timeIndex] / 128.0 - 1.0);
        const freqValue = dataArray[freqIndex] / 255.0;
        
        // Original positions
        const origX = originalPositions[i3];
        const origY = originalPositions[i3 + 1];
        const origZ = originalPositions[i3 + 2];
        
        // Calculate distance from center
        const distFromCenter = Math.sqrt(origX * origX + origZ * origZ);
        
        // Add movement based on audio
        const time = Date.now() * 0.001;
        const angleOffset = time * (1.0 - distFromCenter / 60.0) * 0.5;
        const radialOffset = freqValue * sensitivity * 10.0;
        
        const angle = Math.atan2(origZ, origX) + angleOffset;
        const newRadius = distFromCenter + radialOffset * (1.0 - distFromCenter / 60.0);
        
        const newX = Math.cos(angle) * newRadius;
        const newZ = Math.sin(angle) * newRadius;
        const newY = origY + timeValue * sensitivity * 10.0;
        
        particlePositions.setXYZ(i, newX, newY, newZ);
        
        // Update particle size based on frequency
        particleSizes.setX(i, originalSizes[i] * (1 + freqValue * 2));
    }
    
    particlePositions.needsUpdate = true;
    particleSizes.needsUpdate = true;
    
    // Rotate the visualization
    visualizer.rotation.y += 0.002;
}