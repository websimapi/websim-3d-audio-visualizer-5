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

    // Add grid helper for reference
    const gridHelper = new THREE.GridHelper(200, 50, 0x555555, 0x333333);
    scene.add(gridHelper);
    
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
            video: false,
            audio: true
        });
        
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
        };
        
    } catch (error) {
        console.error('Error capturing audio:', error);
        statusElement.textContent = 'Error: ' + error.message;
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
    const barMaterial = new THREE.MeshPhongMaterial({
        color: config.bars.color1,
        specular: 0xffffff,
        shininess: 50,
        transparent: true,
        opacity: 0.8
    });
    
    const totalBars = config.bars.count;
    const radius = totalBars * 0.2;
    
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
    const geometry = new THREE.IcosahedronGeometry(
        config.sphere.radius, 
        config.sphere.segments
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
    
    // Create material with wireframe overlay
    const material = new THREE.MeshPhongMaterial({
        color: config.sphere.color1,
        emissive: config.sphere.color2,
        emissiveIntensity: 0.5,
        specular: 0xffffff,
        shininess: 50,
        transparent: true,
        opacity: 0.7
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
    
    scene.add(sphere);
    activeVisualization = sphere;
}

// Terrain visualization
function createTerrainVisualization() {
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
    
    const material = new THREE.MeshPhongMaterial({
        vertexColors: true,
        shininess: 80,
        side: THREE.DoubleSide
    });
    
    const terrain = new THREE.Mesh(geometry, material);
    terrain.userData = { originalPositions };
    
    scene.add(terrain);
    activeVisualization = terrain;
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
    const children = activeVisualization.children;
    const totalBars = children.length;
    
    for (let i = 0; i < totalBars; i++) {
        const bar = children[i];
        
        // Map the bar to a frequency bin
        const frequencyIndex = Math.floor(i / totalBars * (dataArray.length / 2));
        const value = dataArray[frequencyIndex] / 255;
        
        // Apply the value with sensitivity
        const targetHeight = value * config.bars.maxHeight * sensitivity + config.bars.initialHeight;
        
        // Smooth transition
        bar.scale.y += (targetHeight - bar.scale.y) * 0.2;
        
        // Update bar position so it grows from the bottom
        bar.position.y = bar.scale.y / 2;
        
        // Add some movement based on low frequencies
        const bassPower = (dataArray[0] + dataArray[1] + dataArray[2]) / (3 * 255);
        const angle = bar.userData.angle + bassPower * 0.2; 
        const radius = totalBars * 0.2 * (1 + bassPower * 0.2);
        
        bar.position.x = Math.sin(angle) * radius;
        bar.position.z = Math.cos(angle) * radius;
        
        // Update color based on height
        bar.material.color.setHSL(
            ((i / totalBars) + (value * 0.2)) % 1.0, 
            0.7, 
            0.4 + value * 0.6
        );
        
        // Update opacity based on value
        bar.material.opacity = 0.4 + value * 0.6;
    }
    
    // Rotate the entire bar group
    activeVisualization.rotation.y += 0.003;
}

function updateSphereVisualization(sensitivity) {
    const positions = activeVisualization.geometry.attributes.position;
    const originalPositions = activeVisualization.userData.originalPositions;
    
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
    
    activeVisualization.material.emissiveIntensity = 0.2 + normalizedAvg * 0.8;
    
    // Slightly rotate sphere
    activeVisualization.rotation.y += 0.001;
    activeVisualization.rotation.x += 0.0005;
}

function updateTerrainVisualization(sensitivity) {
    const positions = activeVisualization.geometry.attributes.position;
    const colors = activeVisualization.geometry.attributes.color;
    const originalPositions = activeVisualization.userData.originalPositions;
    
    // Audio frequencies will drive terrain height
    for (let i = 0; i < positions.count; i++) {
        const vertex = originalPositions[i];
        
        // Map the vertex to an audio frequency
        // Use X and Z position to determine which frequency to sample
        const x = (vertex.x + config.terrain.size/2) / config.terrain.size; // 0 to 1
        const z = (vertex.z + config.terrain.size/2) / config.terrain.size; // 0 to 1
        
        // Calculate index based on position
        const frequencyIndex = Math.floor((x * 0.5 + z * 0.5) * (dataArray.length - 1));
        
        // Calculate height based on frequency data
        const frequency = dataArray[frequencyIndex] / 255.0;
        const height = frequency * config.terrain.amplitude * sensitivity;
        
        // Apply new height
        positions.setY(i, vertex.y + height);
        
        // Update color based on height
        const color = new THREE.Color(config.terrain.color1);
        color.lerp(new THREE.Color(config.terrain.color2), frequency);
        
        colors.setXYZ(i, color.r, color.g, color.b);
    }
    
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    
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

