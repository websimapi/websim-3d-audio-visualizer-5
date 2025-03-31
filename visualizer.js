import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { config } from 'config';

// Main variables
let scene, camera, renderer, analyser, dataArray;
let audioContext, mediaStreamSource;
let activeVisualization = null;
let controls, visualizationType = 'bars';

// DOM elements
const startButton = document.getElementById('startButton');
const statusElement = document.getElementById('status');
const sensitivitySlider = document.getElementById('sensitivity');
const smoothingSlider = document.getElementById('smoothing');
const visualizationTypeSelector = document.getElementById('visualizationType');

// Initialize the scene
function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    
    // Camera setup
    camera = new THREE.PerspectiveCamera(
        config.camera.fov, 
        window.innerWidth / window.innerHeight, 
        config.camera.near, 
        config.camera.far
    );
    camera.position.set(
        config.camera.initialPosition.x,
        config.camera.initialPosition.y,
        config.camera.initialPosition.z
    );
    
    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('visualizer-container').appendChild(renderer.domElement);
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(0, 50, 100);
    scene.add(directionalLight);
    
    // Add controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = config.camera.autoRotateSpeed;

    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Audio capture and analysis setup
async function setupAudioCapture() {
    try {
        // Request user to select a tab to capture
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,  
            audio: true,
            preferCurrentTab: false, 
            selfBrowserSurface: "exclude", 
            systemAudio: "include" 
        });
        
        // Check if audio track exists
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            throw new Error('No audio track found. Please select a tab with audio.');
        }
        
        // Stop video tracks as we only need audio
        stream.getVideoTracks().forEach(track => track.stop());
        
        statusElement.textContent = 'Audio capture started';
        startButton.textContent = 'Change Tab Source';
        
        // Create audio context and analyzer
        audioContext = new AudioContext();
        mediaStreamSource = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        
        analyser.fftSize = config.audio.fftSize;
        analyser.minDecibels = config.audio.minDecibels;
        analyser.maxDecibels = config.audio.maxDecibels;
        analyser.smoothingTimeConstant = config.audio.defaultSmoothing;
        
        mediaStreamSource.connect(analyser);
        
        // Create data array for frequency analysis
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        // Create the currently selected visualization
        createVisualization(visualizationType);
        
        // Start animation loop if not already running
        if (!renderer) return;
        animate();
        
        // Handle stream ending (user stops sharing)
        stream.getAudioTracks()[0].onended = () => {
            statusElement.textContent = 'Audio capture stopped';
            startButton.textContent = 'Start Visualizer';
            if (activeVisualization) {
                scene.remove(activeVisualization);
                activeVisualization = null;
            }
        };
        
    } catch (error) {
        console.error('Error capturing audio:', error);
        statusElement.textContent = 'Error: ' + error.message;
        startButton.textContent = 'Try Again';
    }
}

// Create the selected visualization
function createVisualization(type) {
    // Remove existing visualization if any
    if (activeVisualization) {
        scene.remove(activeVisualization);
    }
    
    switch (type) {
        case 'bars':
            createBarVisualization();
            break;
        case 'sphere':
            createSphereVisualization();
            break;
        case 'terrain':
            createTerrainVisualization();
            break;
    }
}

// Bar visualization
function createBarVisualization() {
    const group = new THREE.Group();
    const barGeometry = new THREE.BoxGeometry(1, 1, 1);
    const barMaterial = new THREE.MeshPhysicalMaterial({
        color: config.bars.color1,
        metalness: 0.5,
        roughness: 0.2,
        transparent: true,
        opacity: 0.8,
        emissive: 0x222222
    });
    
    const totalBars = config.bars.count;
    const radius = totalBars * 0.2;
    
    // Add core glow sphere
    const coreGeometry = new THREE.SphereGeometry(radius * 0.3, 32, 32);
    const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    group.add(core);
    
    // Create particle system for ambience
    const particleGeometry = new THREE.BufferGeometry();
    const particleCount = 500;
    const particlePositions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount * 3; i += 3) {
        const angle = Math.random() * Math.PI * 2;
        const radiusVariance = radius * (1 + Math.random() * 1.5);
        particlePositions[i] = Math.sin(angle) * radiusVariance;
        particlePositions[i+1] = (Math.random() - 0.5) * radius;
        particlePositions[i+2] = Math.cos(angle) * radiusVariance;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.8,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });
    
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    group.add(particles);
    
    for (let i = 0; i < totalBars; i++) {
        const bar = new THREE.Mesh(barGeometry, barMaterial.clone());
        const angle = (i / totalBars) * Math.PI * 2;
        
        bar.position.x = Math.sin(angle) * radius;
        bar.position.z = Math.cos(angle) * radius;
        bar.position.y = 0.5;
        bar.scale.y = config.bars.initialHeight;
        
        // Store original positions for animation
        bar.userData = {
            index: i,
            angle: angle
        };
        
        // Color gradient based on position
        const hue = i / totalBars;
        bar.material.color.setHSL(hue, 1.0, 0.5);
        
        group.add(bar);
    }
    
    scene.add(group);
    activeVisualization = group;
}

// Sphere visualization
function createSphereVisualization() {
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
    
    const sphere = new THREE.Mesh(geometry, material);
    const wireframe = new THREE.Mesh(geometry, wireframeMaterial);
    
    sphere.add(wireframe);
    sphere.userData = { originalPositions };
    group.add(sphere);
    
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
    
    scene.add(group);
    activeVisualization = group;
}

// Terrain visualization
function createTerrainVisualization() {
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
    
    scene.add(group);
    activeVisualization = group;
}

// Update visualizations based on audio data
function updateVisualization() {
    if (!analyser || !activeVisualization) return;
    
    // Get audio data
    analyser.getByteFrequencyData(dataArray);
    
    // Get sensitivity value from slider
    const sensitivity = parseFloat(sensitivitySlider.value);
    
    switch (visualizationType) {
        case 'bars':
            updateBarVisualization(sensitivity);
            break;
        case 'sphere':
            updateSphereVisualization(sensitivity);
            break;
        case 'terrain':
            updateTerrainVisualization(sensitivity);
            break;
    }
}

function updateBarVisualization(sensitivity) {
    const bars = activeVisualization.children.filter((child, index) => index >= 2); // Skip core and particles
    const totalBars = bars.length;
    const core = activeVisualization.children[0];
    const particles = activeVisualization.children[1];
    
    // Calculate average frequency for core effects
    const averageFrequency = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length / 255;
    
    // Update core based on bass frequencies
    const bassPower = (dataArray[0] + dataArray[1] + dataArray[2]) / (3 * 255);
    core.scale.set(
        1 + bassPower * 0.5,
        1 + bassPower * 0.5,
        1 + bassPower * 0.5
    );
    
    core.material.opacity = 0.2 + bassPower * 0.5;
    core.material.color.setHSL(bassPower * 0.2, 0.8, 0.5);
    
    // Update particles
    const particlePositions = particles.geometry.attributes.position;
    for (let i = 0; i < particlePositions.count; i++) {
        const idx = i % dataArray.length;
        const frequencyValue = dataArray[idx] / 255.0;
        
        // Get current position
        const x = particlePositions.getX(i);
        const y = particlePositions.getY(i);
        const z = particlePositions.getZ(i);
        
        // Calculate direction to center
        const dir = new THREE.Vector3(x, y, z).normalize();
        
        // Move particles based on audio 
        const newDist = (totalBars * 0.2) * (1 + frequencyValue * 2);
        const newPos = dir.multiplyScalar(newDist);
        
        particlePositions.setXYZ(i, newPos.x, (y * 0.98) + (Math.random() - 0.5) * 0.5, newPos.z);
    }
    
    particlePositions.needsUpdate = true;
    particles.material.opacity = 0.2 + averageFrequency * 0.6;
    
    // Update bars
    for (let i = 0; i < totalBars; i++) {
        const bar = bars[i];
        
        // Map the bar to a frequency bin
        const frequencyIndex = Math.floor(i / totalBars * (dataArray.length / 2));
        const value = dataArray[frequencyIndex] / 255;
        
        // Apply the value with sensitivity
        const targetHeight = value * config.bars.maxHeight * sensitivity + config.bars.initialHeight;
        
        // Smooth transition
        bar.scale.y += (targetHeight - bar.scale.y) * 0.2;
        
        // Scale width based on audio intensity for bulging effect
        bar.scale.x = 1 + value * 0.5;
        bar.scale.z = 1 + value * 0.5;
        
        // Update bar position so it grows from the bottom
        bar.position.y = bar.scale.y / 2;
        
        // Add some movement based on low frequencies
        const angle = bar.userData.angle + bassPower * 0.2 + (i / totalBars) * 0.1; 
        const radius = totalBars * 0.2 * (1 + bassPower * 0.3 + value * 0.1);
        
        bar.position.x = Math.sin(angle) * radius;
        bar.position.z = Math.cos(angle) * radius;
        
        // Update color based on height
        bar.material.color.setHSL(
            ((i / totalBars) + (value * 0.2)) % 1.0, 
            0.7, 
            0.4 + value * 0.6
        );
        
        // Update material properties
        bar.material.emissiveIntensity = value * 0.5;
        bar.material.metalness = 0.3 + value * 0.7;
        bar.material.opacity = 0.6 + value * 0.4;
    }
    
    // Rotate the entire bar group
    activeVisualization.rotation.y += 0.003;
}

function updateSphereVisualization(sensitivity) {
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
    
    // Process orbital rings - adapt based on bass frequencies
    for (let i = 1; i <= 3; i++) {
        const ring = activeVisualization.children[i];
        
        // Get bass frequency data
        const bassValue = (dataArray[0] + dataArray[1] + dataArray[2]) / (3 * 255);
        
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
    const particles = activeVisualization.children[4];
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
    activeVisualization.rotation.y += 0.001;
}

function updateTerrainVisualization(sensitivity) {
    // Get terrain mesh 
    const terrain = activeVisualization.children[0];
    const positions = terrain.geometry.attributes.position;
    const colors = terrain.geometry.attributes.color;
    const originalPositions = terrain.userData.originalPositions;
    
    // Get reflection plane
    const reflection = activeVisualization.children[1];
    
    // Get fog particles
    const fog = activeVisualization.children[2];
    const fogPositions = fog.geometry.attributes.position;
    const originalFogPositions = fog.userData.positions;
    
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
    
    // Update reflection material based on average frequency
    const averageFrequency = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length / 255;
    reflection.material.opacity = 0.2 + averageFrequency * 0.4;
    reflection.material.color.setHSL(0.6, 0.8, averageFrequency * 0.5);
    
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
    activeVisualization.rotation.y += 0.001;
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    updateVisualization();
    
    controls.update();
    renderer.render(scene, camera);
}

// Event listeners
startButton.addEventListener('click', setupAudioCapture);

smoothingSlider.addEventListener('input', (e) => {
    if (analyser) {
        analyser.smoothingTimeConstant = parseFloat(e.target.value);
    }
});

visualizationTypeSelector.addEventListener('change', (e) => {
    visualizationType = e.target.value;
    if (scene && analyser) {
        createVisualization(visualizationType);
    }
});

// Initialize everything
initScene();