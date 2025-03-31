import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { config } from './config.js';
// Import visualization modules
import * as Bars from './visualizations/bars.js';
import * as Sphere from './visualizations/sphere.js';
import * as Terrain from './visualizations/terrain.js';
import * as Galaxy from './visualizations/galaxy.js'; // Import the new visualization

// Main variables
let scene, camera, renderer, analyser, dataArray;
let audioContext, mediaStreamSource;
let activeVisualization = null; // This will now hold the group/object returned by the create function
let activeVisualizationModule = null; // This will hold the imported module (Bars, Sphere, etc.)
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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Slightly brighter ambient light
    scene.add(ambientLight);

    // Add point light for more dynamic lighting
    const pointLight = new THREE.PointLight(0xffffff, 1.5, 500);
    pointLight.position.set(50, 100, 150);
    scene.add(pointLight);

    // Add controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = config.camera.autoRotateSpeed;
    controls.listenToKeyEvents( window ); // Allow keyboard controls

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

        // Close existing audio context if present
        if (audioContext) {
            await audioContext.close();
        }

        // Create audio context and analyzer
        audioContext = new AudioContext();
        mediaStreamSource = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();

        analyser.fftSize = config.audio.fftSize;
        analyser.minDecibels = config.audio.minDecibels;
        analyser.maxDecibels = config.audio.maxDecibels;
        analyser.smoothingTimeConstant = parseFloat(smoothingSlider.value); // Use current slider value

        mediaStreamSource.connect(analyser);

        // Create data array for frequency analysis
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Create the currently selected visualization
        await createVisualization(visualizationType); // Make async to handle potential module loading

        // Start animation loop if not already running
        if (!renderer) return;
        // Ensure animate is only called once
        if (renderer.info.render.frame === 0) {
             animate();
        }


        // Handle stream ending (user stops sharing)
        stream.getAudioTracks()[0].onended = () => {
            statusElement.textContent = 'Audio capture stopped';
            startButton.textContent = 'Start Visualizer';
            if (activeVisualization) {
                scene.remove(activeVisualization);
                activeVisualization = null;
                activeVisualizationModule = null;
            }
            // Optionally stop the animation loop or clear dataArray?
            // For now, let it continue rendering the scene without updates.
        };

    } catch (error) {
        console.error('Error capturing audio:', error);
        statusElement.textContent = 'Error: ' + error.message;
        startButton.textContent = 'Try Again';
    }
}

// Create the selected visualization by calling the appropriate module
async function createVisualization(type) {
    // Remove existing visualization if any
    if (activeVisualization) {
        scene.remove(activeVisualization);
        activeVisualization = null;
        activeVisualizationModule = null;
    }

    // Select the correct module based on type
    switch (type) {
        case 'bars':
            activeVisualizationModule = Bars;
            break;
        case 'sphere':
            activeVisualizationModule = Sphere;
            break;
        case 'terrain':
            activeVisualizationModule = Terrain;
            break;
        case 'galaxy': // Add the new case
            activeVisualizationModule = Galaxy;
            break;
        default:
            console.error(`Unknown visualization type: ${type}`);
            activeVisualizationModule = Bars; // Default to bars
            visualizationType = 'bars';
            visualizationTypeSelector.value = 'bars';
            break;
    }

    // Call the create function from the selected module
    if (activeVisualizationModule && typeof activeVisualizationModule.createVisualization === 'function') {
        activeVisualization = activeVisualizationModule.createVisualization(scene, config);
        if (activeVisualization) {
            scene.add(activeVisualization);
        } else {
             console.error(`Create function for ${type} did not return an object.`);
        }
    }
}

// Update visualizations based on audio data by calling the active module's update function
function updateVisualization() {
    if (!analyser || !activeVisualization || !activeVisualizationModule || !dataArray) return;

    // Get audio data
    analyser.getByteFrequencyData(dataArray);

    // Get sensitivity value from slider
    const sensitivity = parseFloat(sensitivitySlider.value);

    // Call the update function from the active module
    if (typeof activeVisualizationModule.updateVisualization === 'function') {
        activeVisualizationModule.updateVisualization(activeVisualization, dataArray, analyser, sensitivity, config);
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate); // Schedule next frame

    if (analyser && dataArray) { // Only update if audio is active
        updateVisualization();
    }

    controls.update(); // Update orbit controls (includes auto-rotate)
    renderer.render(scene, camera); // Render the scene
}

// Event listeners
startButton.addEventListener('click', setupAudioCapture);

smoothingSlider.addEventListener('input', (e) => {
    if (analyser) {
        analyser.smoothingTimeConstant = parseFloat(e.target.value);
    }
});

visualizationTypeSelector.addEventListener('change', async (e) => { // Make async
    visualizationType = e.target.value;
    // Only create new visualization if audio is already set up
    if (scene && analyser && audioContext && audioContext.state === 'running') {
        await createVisualization(visualizationType);
    } else if (scene && !analyser) {
        // If audio isn't running, just prepare the type for when it starts
        // No need to call createVisualization here, it will be called in setupAudioCapture
    }
});

// Initialize everything
initScene();